import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import mime from 'mime-types';

const META_API_VERSION = 'v21.0';
const BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

export class MetaAdsService {
  private accessToken: string;
  private adAccountId: string;

  constructor(accessToken: string, adAccountId: string) {
    this.accessToken = accessToken;
    this.adAccountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  }

  private get authHeader() {
    return { Authorization: `Bearer ${this.accessToken}` };
  }

  async getAdAccounts() {
    const response = await axios.get(`${BASE_URL}/me/adaccounts`, {
      params: { 
        access_token: this.accessToken, 
        fields: 'name,id,account_id,currency',
        limit: 100
      }
    });
    return response.data.data;
  }

  async getPages() {
    try {
      // Try to get pages with instagram_accounts
      const response = await axios.get(`${BASE_URL}/me/accounts`, {
        params: { 
          access_token: this.accessToken, 
          fields: 'name,id,access_token,instagram_accounts{id,username}',
          limit: 100
        }
      });
      return response.data.data;
    } catch (error: any) {
      // If it fails (likely due to missing instagram_basic permission), fallback to basic page info
      const retryResponse = await axios.get(`${BASE_URL}/me/accounts`, {
        params: { 
          access_token: this.accessToken, 
          fields: 'name,id,access_token',
          limit: 100
        }
      });
      return retryResponse.data.data;
    }
  }

  async getPixels(adAccountId: string) {
    const response = await axios.get(`${BASE_URL}/${adAccountId}/adspixels`, {
      params: { 
        access_token: this.accessToken, 
        fields: 'name,id',
        limit: 100
      }
    });
    return response.data.data;
  }

  async getBusinessManagers() {
    const response = await axios.get(`${BASE_URL}/me/businesses`, {
      params: { 
        access_token: this.accessToken, 
        fields: 'name,id',
        limit: 100
      }
    });
    return response.data.data;
  }

  async uploadVideo(filePath: string, name: string) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Video file not found at ${filePath}`);
    }
    const stats = fs.statSync(filePath);
    console.log(`Uploading video: ${name}, size: ${stats.size} bytes`);

    const url = `${BASE_URL}/${this.adAccountId}/advideos`;
    const formData = new FormData();
    
    // Try to get mime type from filename, fallback to video/mp4
    let contentType = mime.lookup(name);
    if (!contentType) {
      // If no extension, try to guess from the file itself or default to mp4
      contentType = 'video/mp4';
    }
    
    // Ensure filename has an extension
    let finalName = name;
    if (!finalName.includes('.') && contentType) {
      const ext = mime.extension(contentType);
      if (ext) finalName += `.${ext}`;
    }
    
    console.log(`Detected content type for ${name}: ${contentType}. Final filename: ${finalName}`);
    
    formData.append('source', fs.createReadStream(filePath), { 
      filename: finalName,
      contentType: contentType
    });
    formData.append('name', finalName);
    formData.append('access_token', this.accessToken);

    const response = await axios.post(url, formData, {
      headers: formData.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    return response.data; // { id: 'video_id' }
  }

  async getVideoStatus(videoId: string) {
    const response = await axios.get(`${BASE_URL}/${videoId}`, {
      params: {
        access_token: this.accessToken,
        fields: 'status'
      }
    });
    return response.data.status;
  }

  async waitForVideoProcessing(videoId: string, maxRetries = 30) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const status = await this.getVideoStatus(videoId);
        console.log(`Video ${videoId} status (attempt ${i + 1}/${maxRetries}):`, JSON.stringify(status));
        
        if (status && status.video_status === 'ready') {
          return true;
        }
        
        if (status && status.video_status === 'deleted') {
          throw new Error('Video was deleted during processing');
        }
        
        if (status && status.video_status === 'error') {
          throw new Error(`Meta video processing error: ${status.error_description || 'Unknown error'}`);
        }
      } catch (error: any) {
        console.error(`Error checking video status for ${videoId}:`, error.message);
        // If it's a 404, maybe it's not propagated yet
        if (error.response?.status !== 404) {
          throw error;
        }
      }

      // Wait 5 seconds before next check
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    return false;
  }

  async createCampaign(name: string, objective: string, status: 'ACTIVE' | 'PAUSED' = 'PAUSED', budget?: number, bidStrategy?: string) {
    const isCBO = !!(budget && budget > 0);
    
    const params = new URLSearchParams();
    params.append('name', name);
    params.append('objective', objective);
    params.append('status', status);
    params.append('buying_type', 'AUCTION');
    params.append('special_ad_categories', '[]');
    params.append('access_token', this.accessToken);
    params.append('is_campaign_budget_optimization', isCBO.toString());

    if (isCBO) {
      params.append('daily_budget', Math.round(budget! * 100).toString());
      params.append('bid_strategy', bidStrategy || 'LOWEST_COST_WITHOUT_CAP');
    }

    console.log(`[META API] Creating Campaign: ${name}, isCBO: ${isCBO}`);
    const response = await axios.post(`${BASE_URL}/${this.adAccountId}/campaigns`, params);
    return response.data;
  }

  async createAdSet(campaignId: string, name: string, budget: number, pixelId: string, targeting: any, status: 'ACTIVE' | 'PAUSED' = 'PAUSED', isCBO: boolean = false) {
    const finalTargeting = typeof targeting === 'string' ? JSON.parse(targeting) : { ...targeting };
    
    if (!finalTargeting.targeting_automation) {
      finalTargeting.targeting_automation = { advantage_audience: 0 };
    } else if (finalTargeting.targeting_automation.advantage_audience === undefined) {
      finalTargeting.targeting_automation.advantage_audience = 0;
    }

    if (finalTargeting.publisher_platforms && !finalTargeting.device_platforms) {
      finalTargeting.device_platforms = ['mobile', 'desktop'];
    }

    const params = new URLSearchParams();
    params.append('name', name);
    params.append('campaign_id', campaignId);
    params.append('billing_event', 'IMPRESSIONS');
    params.append('optimization_goal', 'OFFSITE_CONVERSIONS');
    params.append('destination_type', 'WEBSITE');
    params.append('targeting', JSON.stringify(finalTargeting));
    params.append('promoted_object', JSON.stringify({ pixel_id: pixelId, custom_event_type: 'PURCHASE' }));
    params.append('pacing_type', '["standard"]');
    params.append('status', status);
    params.append('access_token', this.accessToken);
    
    // Meta API v21.0 requires this field to be explicitly 'true' or 'false' as a string.
    // It should be 'false' when using CBO (Campaign Budget Optimization).
    // It should also be 'false' for standard ABO (Ad Set Budget Optimization).
    // We only set it to 'true' if we specifically want the "Advantage+ ad set budget" sharing feature (ABO sharing).
    // For now, we keep it 'false' to ensure standard behavior and avoid the "missing field" error.
    params.append('is_adset_budget_sharing_enabled', 'false');

    // If NOT using CBO, we must provide the budget at the adset level (ABO)
    if (!isCBO) {
      params.append('daily_budget', Math.round(budget * 100).toString());
    }

    console.log(`[META API] Creating AdSet: ${name}, isCBO: ${isCBO}`);
    const response = await axios.post(`${BASE_URL}/${this.adAccountId}/adsets`, params);
    return response.data;
  }

  async createAdCreative(name: string, pageId: string, videoId: string, instagramActorId: string, body: string, title: string, link: string = 'https://example.com') {
    // ... existing thumbnail logic ...
    let imageUrl = '';
    let imageHash = '';
    
    try {
      console.log(`Fetching thumbnails for video ${videoId}...`);
      const thumbRes = await axios.get(`${BASE_URL}/${videoId}/thumbnails`, {
        params: { access_token: this.accessToken }
      });
      
      if (thumbRes.data.data && thumbRes.data.data.length > 0) {
        const preferred = thumbRes.data.data.find((t: any) => t.is_preferred) || thumbRes.data.data[0];
        imageUrl = preferred.uri;
        if (preferred.hash) {
          imageHash = preferred.hash;
        }
      } else {
        const videoRes = await axios.get(`${BASE_URL}/${videoId}`, {
          params: { access_token: this.accessToken, fields: 'picture' }
        });
        imageUrl = videoRes.data.picture;
      }
    } catch (e: any) {
      console.error('Error fetching thumbnails:', e.message);
    }

    const videoData: any = {
      video_id: videoId,
      call_to_action: {
        type: 'LEARN_MORE',
        value: { link }
      },
      title,
      message: body
    };

    if (imageHash) {
      videoData.image_hash = imageHash;
    } else if (imageUrl) {
      videoData.image_url = imageUrl;
    }

    const objectStorySpec: any = {
      page_id: pageId,
      video_data: videoData
    };

    if (instagramActorId) {
      objectStorySpec.instagram_actor_id = instagramActorId;
    }

    const params = new URLSearchParams();
    params.append('name', name);
    params.append('object_story_spec', JSON.stringify(objectStorySpec));
    params.append('access_token', this.accessToken);

    console.log(`[META API] Creating AdCreative: ${name}`);
    const response = await axios.post(`${BASE_URL}/${this.adAccountId}/adcreatives`, params);
    return response.data;
  }

  async createAd(adSetId: string, creativeId: string, name: string, status: 'ACTIVE' | 'PAUSED' = 'PAUSED') {
    const params = new URLSearchParams();
    params.append('name', name);
    params.append('adset_id', adSetId);
    params.append('creative', JSON.stringify({ creative_id: creativeId }));
    params.append('status', status);
    params.append('access_token', this.accessToken);

    console.log(`[META API] Creating Ad: ${name}`);
    const response = await axios.post(`${BASE_URL}/${this.adAccountId}/ads`, params);
    return response.data;
  }
}
