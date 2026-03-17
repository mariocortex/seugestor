import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import db from '../db.ts';
import { MetaAdsService } from '../services/metaAds.ts';
import { AIService } from '../services/ai.ts';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.get('/test', (req, res) => {
  res.json({ message: 'API Router is working' });
});

// OAuth Routes
router.get('/auth/url', (req, res) => {
  const appId = process.env.META_APP_ID;
  const redirectUri = `${process.env.APP_URL}/api/auth/callback`;
  const scope = 'ads_management,ads_read,pages_read_engagement,pages_show_list,business_management';
  
  const url = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&response_type=code`;
  
  res.json({ url });
});

router.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const redirectUri = `${process.env.APP_URL}/api/auth/callback`;

  if (!appId || !appSecret) {
    console.error('Missing META_APP_ID or META_APP_SECRET');
    return res.status(500).send('Configuração do servidor incompleta (META_APP_ID/SECRET).');
  }

  try {
    const response = await axios.get(`https://graph.facebook.com/v21.0/oauth/access_token`, {
      params: {
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: redirectUri,
        code
      }
    });

    const { access_token } = response.data;
    
    // Exchange for long-lived token
    let finalToken = access_token;
    try {
      const longLivedResponse = await axios.get(`https://graph.facebook.com/v21.0/oauth/access_token`, {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: access_token
        }
      });
      finalToken = longLivedResponse.data.access_token;
    } catch (llError) {
      console.error('Failed to exchange for long-lived token, using short-lived instead');
    }

    // Get user info
    const meResponse = await axios.get(`https://graph.facebook.com/v21.0/me`, {
      params: { 
        access_token: finalToken,
        fields: 'id,name,picture'
      }
    });

    const profile = meResponse.data;
    const pictureUrl = profile.picture?.data?.url;

    // Save to DB
    const stmt = db.prepare(`
      INSERT INTO profiles (id, name, access_token, picture_url) 
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET 
        name=excluded.name, 
        access_token=excluded.access_token, 
        picture_url=excluded.picture_url
    `);
    stmt.run(profile.id, profile.name, finalToken, pictureUrl);

    (req.session as any).metaAccessToken = finalToken;

    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Autenticação bem-sucedida. Esta janela fechará automaticamente.</p>
        </body>
      </html>
    `);
  } catch (error: any) {
    console.error('OAuth Error:', error.response?.data || error.message);
    console.error('Redirect URI used:', redirectUri);
    res.status(500).send('Erro na autenticação com Meta.');
  }
});

router.get('/profiles', (req, res) => {
  try {
    const profiles = db.prepare('SELECT id, name, picture_url FROM profiles ORDER BY created_at DESC').all();
    res.json(profiles);
  } catch (error: any) {
    console.error('Error fetching profiles:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/profiles/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM profiles WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting profile:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/profile/:id/assets', async (req, res) => {
  const profile = db.prepare('SELECT access_token FROM profiles WHERE id = ?').get(req.params.id) as any;
  if (!profile) return res.status(404).json({ error: 'Perfil não encontrado' });

  const meta = new MetaAdsService(profile.access_token, '');
  try {
    const results = await Promise.allSettled([
      meta.getAdAccounts(),
      meta.getPages(),
      meta.getBusinessManagers()
    ]);

    const adAccounts = results[0].status === 'fulfilled' ? results[0].value : [];
    const pages = results[1].status === 'fulfilled' ? results[1].value : [];
    const businesses = results[2].status === 'fulfilled' ? results[2].value : [];

    if (results.some(r => r.status === 'rejected')) {
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          const endpoint = ['AdAccounts', 'Pages', 'Businesses'][i];
          console.error(`Failed to fetch ${endpoint}:`, r.reason?.response?.data || r.reason?.message || r.reason);
        }
      });
    }

    res.json({ adAccounts, pages, businesses });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/profile/:profileId/ad-account/:accountId/pixels', async (req, res) => {
  const profile = db.prepare('SELECT access_token FROM profiles WHERE id = ?').get(req.params.profileId) as any;
  if (!profile) return res.status(404).json({ error: 'Perfil não encontrado' });

  const meta = new MetaAdsService(profile.access_token, req.params.accountId);
  try {
    const pixels = await meta.getPixels(req.params.accountId);
    res.json(pixels);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/config', (req, res) => {
  res.json({
    hasMetaToken: !!((req.session as any).metaAccessToken || process.env.META_ACCESS_TOKEN),
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    adAccountId: process.env.META_AD_ACCOUNT_ID,
    appId: process.env.META_APP_ID
  });
});

router.post('/upload', upload.array('videos'), (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }
    const results = files.map(file => {
      const stmt = db.prepare('INSERT INTO uploads (filename, original_name, path) VALUES (?, ?, ?)');
      const info = stmt.run(file.filename, file.originalname, file.path);
      return { id: info.lastInsertRowid, originalName: file.originalname, filename: file.filename };
    });
    res.json(results);
  } catch (error: any) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/uploads', (req, res) => {
  try {
    const uploads = db.prepare('SELECT * FROM uploads ORDER BY created_at DESC').all();
    res.json(uploads);
  } catch (error: any) {
    console.error('Error fetching uploads:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/uploads/:id', (req, res) => {
  try {
    const upload = db.prepare('SELECT * FROM uploads WHERE id = ?').get(req.params.id) as any;
    if (upload) {
      try {
        if (fs.existsSync(upload.path)) {
          fs.unlinkSync(upload.path);
        }
      } catch (err) {
        console.error('Failed to delete file:', err);
      }
      db.prepare('DELETE FROM uploads WHERE id = ?').run(req.params.id);
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting upload:', error);
    res.status(500).json({ error: error.message });
  }
});

router.patch('/uploads/:id', (req, res) => {
  const { original_name } = req.body;
  db.prepare('UPDATE uploads SET original_name = ? WHERE id = ?').run(original_name, req.params.id);
  res.json({ success: true });
});

router.post('/generate-metadata', async (req, res) => {
  const { creativeName, count } = req.body;
  try {
    const ai = new AIService(process.env.GEMINI_API_KEY!);
    const variations = await ai.generateMetadata(creativeName, count);
    res.json(variations);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/create-campaigns', async (req, res) => {
  const { 
    profileId,
    adAccountId, 
    pageId, 
    pixelId, 
    instagramActorId, 
    budget, 
    objective, 
    targeting, 
    creatives, // Array of { uploadId, variations: [{ title, body }] }
    status,
    budgetSharingEnabled,
    budgetType = 'ABO'
  } = req.body;

  const budgetValue = parseFloat(budget?.toString() || '0');
  
  // Determine if it's CBO or ABO
  // CBO is enabled if budgetType is 'CBO' OR budgetSharingEnabled is true (UI toggle)
  const isCBO = (budgetType === 'CBO' || budgetSharingEnabled === true || budgetSharingEnabled === 'true') && budgetValue > 0;
  
  console.log(`[DEBUG] budgetValue: ${budgetValue}, budgetType: ${budgetType}, budgetSharingEnabled: ${budgetSharingEnabled}, isCBO: ${isCBO}`);

  if (!profileId || !adAccountId || !pageId || !pixelId) {
    return res.status(400).json({ error: 'Perfil, Conta de Anúncios, Página e Pixel são obrigatórios.' });
  }

  const profile = db.prepare('SELECT access_token FROM profiles WHERE id = ?').get(profileId) as any;
  const token = profile?.access_token || process.env.META_ACCESS_TOKEN;
  
  if (!token) return res.status(401).json({ error: 'Token não encontrado' });

  const meta = new MetaAdsService(token, adAccountId);
  const logs: string[] = [];

  try {
    for (const creative of creatives) {
      const upload = db.prepare('SELECT * FROM uploads WHERE id = ?').get(creative.uploadId) as any;
      
      // 1. Upload video to Meta if not already done
      let metaVideoId = upload.meta_video_id;
      if (!metaVideoId) {
        logs.push(`Uploading video ${upload.original_name} to Meta...`);
        const videoResult = await meta.uploadVideo(upload.path, upload.original_name);
        metaVideoId = videoResult.id;
        db.prepare('UPDATE uploads SET meta_video_id = ? WHERE id = ?').run(metaVideoId, upload.id);
      }

      logs.push(`Checking video ${metaVideoId} status...`);
      try {
        const isReady = await meta.waitForVideoProcessing(metaVideoId);
        if (!isReady) {
          throw new Error(`Video ${metaVideoId} processing timed out. Meta is taking too long to process this video.`);
        }
        logs.push(`Video ${metaVideoId} is ready!`);
        // Increased delay for internal propagation (Meta can be slow)
        logs.push(`Waiting 10 seconds for Meta to propagate video ${metaVideoId}...`);
        await new Promise(resolve => setTimeout(resolve, 10000));
      } catch (processingError: any) {
        logs.push(`Error processing video: ${processingError.message}`);
        // If the video has an error, we should probably clear the meta_video_id so it can be re-uploaded
        db.prepare('UPDATE uploads SET meta_video_id = NULL WHERE id = ?').run(creative.uploadId);
        throw processingError;
      }

      // 2. Create campaigns for each variation
      try {
        for (let i = 0; i < creative.variations.length; i++) {
          const variation = creative.variations[i];
          const campaignName = `[AUTO] ${upload.original_name} - Var ${i + 1}`;
          
          logs.push(`Creating campaign: ${campaignName} (${isCBO ? 'CBO' : 'ABO'})`);
          const campaign = await meta.createCampaign(
            campaignName, 
            objective, 
            status, 
            isCBO ? budgetValue : undefined
          );
          
          logs.push(`Creating adset for campaign ${campaign.id}`);
          // Fallback targeting if not provided
          const finalTargeting = targeting || {
            geo_locations: { countries: ['BR'] },
            age_min: 18,
            age_max: 65,
            publisher_platforms: ['facebook', 'instagram']
          };
          const adset = await meta.createAdSet(campaign.id, `AdSet - ${campaignName}`, budgetValue, pixelId, finalTargeting, status, isCBO);
          
          logs.push(`Creating creative for adset ${adset.id}`);
          const adCreative = await meta.createAdCreative(
            `Creative - ${campaignName}`,
            pageId,
            metaVideoId,
            instagramActorId,
            variation.body,
            variation.title,
            req.body.websiteUrl || 'https://example.com'
          );

          logs.push(`Creating ad for adset ${adset.id}`);
          await meta.createAd(adset.id, adCreative.id, `Ad - ${campaignName}`, status);
        }
      } catch (campaignError: any) {
        const errorData = campaignError.response?.data?.error;
        // If it's a video format error (1363024), clear the video ID so it can be re-uploaded
        if (errorData?.error_subcode === 1363024 || errorData?.code === 1363024) {
          logs.push(`Detected video format error (1363024). Clearing video ${metaVideoId} from cache.`);
          db.prepare('UPDATE uploads SET meta_video_id = NULL WHERE id = ?').run(creative.uploadId);
        }
        throw campaignError;
      }
    }

    res.json({ success: true, logs });
  } catch (error: any) {
    const errorData = error.response?.data?.error || error.message;
    console.error('Meta API Error:', JSON.stringify(errorData, null, 2));
    
    let errorMessage = 'Erro desconhecido na API do Meta.';
    if (typeof errorData === 'object') {
      errorMessage = errorData.error_user_msg || errorData.message || JSON.stringify(errorData);
      if (errorData.error_user_title) {
        errorMessage = `${errorData.error_user_title}: ${errorMessage}`;
      }
    } else {
      errorMessage = errorData;
    }
    
    res.status(500).json({ 
      success: false, 
      error: errorMessage, 
      metaError: errorData,
      logs 
    });
  }
});

router.get('/templates', (req, res) => {
  const templates = db.prepare('SELECT * FROM templates').all();
  res.json(templates);
});

router.post('/templates', (req, res) => {
  const { name, config } = req.body;
  db.prepare('INSERT INTO templates (name, config) VALUES (?, ?)').run(name, JSON.stringify(config));
  res.json({ success: true });
});

// Error handler for the router
router.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('API Router Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Erro interno no servidor',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

export default router;
