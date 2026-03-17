import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  Upload, 
  Settings, 
  Play, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  ChevronRight,
  Video,
  Copy,
  Save,
  Facebook,
  RefreshCw,
  Users,
  Image,
  Layout
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Creative {
  id: number;
  original_name: string;
  filename: string;
  variations: { title: string; body: string }[];
  is_cleaned?: boolean;
  copies_count?: number;
}

interface Config {
  hasMetaToken: boolean;
  hasGeminiKey: boolean;
  adAccountId: string;
  appId: string;
}

interface MetaAsset {
  id: string;
  name: string;
  [key: string]: any;
}

interface MetaProfile {
  id: string;
  name: string;
  picture_url: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'creatives' | 'launcher' | 'settings' | 'profiles' | 'execution'>('creatives');
  const [config, setConfig] = useState<Config | null>(null);
  const [uploads, setUploads] = useState<Creative[]>([]);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [showConnectModal, setShowConnectModal] = useState(false);
  
  // Launcher State
  const [selectedCreativeId, setSelectedCreativeId] = useState<number | null>(null);
  const [launchQuantity, setLaunchQuantity] = useState(1);
  
  // UI State
  const [previewVideo, setPreviewVideo] = useState<string | null>(null);
  const [editingCreative, setEditingCreative] = useState<{ id: number, name: string } | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  
  // Profiles State
  const [profiles, setProfiles] = useState<MetaProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');

  // Meta Assets State
  const [adAccounts, setAdAccounts] = useState<MetaAsset[]>([]);
  const [pages, setPages] = useState<MetaAsset[]>([]);
  const [pixels, setPixels] = useState<MetaAsset[]>([]);
  const [instagramAccounts, setInstagramAccounts] = useState<MetaAsset[]>([]);
  const [businesses, setBusinesses] = useState<MetaAsset[]>([]);

  // Campaign Builder State
  const [campaignConfig, setCampaignConfig] = useState({
    profileId: '',
    businessId: '',
    adAccountId: '',
    pageId: '',
    pixelId: '',
    instagramActorId: '',
    campaignName: 'Nova Campanha de Vendas',
    adSetName: 'Conjunto de Anúncios - {{creative_name}}',
    adName: 'Anúncio - {{creative_name}} - {{variation_index}}',
    budget: 33,
    budgetType: 'ABO' as 'CBO' | 'ABO',
    objective: 'OUTCOME_SALES',
    country: 'BR',
    websiteUrl: '',
    ageMin: 35,
    ageMax: 65,
    genders: [1, 2] as number[], // 1=Male, 2=Female
    variationsPerCreative: 5,
    status: 'PAUSED' as 'ACTIVE' | 'PAUSED',
    budgetSharingEnabled: false // ABO by default, so sharing is false
  });

  useEffect(() => {
    fetchConfig();
    fetchUploads();
    fetchProfiles();

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        fetchProfiles();
        setShowConnectModal(false);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (selectedProfileId) {
      setLoading(true);
      fetchAssets(selectedProfileId).finally(() => setLoading(false));
      setCampaignConfig(prev => ({ ...prev, profileId: selectedProfileId }));
    }
  }, [selectedProfileId]);

  useEffect(() => {
    if (selectedProfileId && campaignConfig.adAccountId) {
      fetchPixels(selectedProfileId, campaignConfig.adAccountId);
    }
  }, [selectedProfileId, campaignConfig.adAccountId]);

  useEffect(() => {
    if (campaignConfig.pageId) {
      const selectedPage = pages.find(p => p.id === campaignConfig.pageId);
      if (selectedPage?.instagram_accounts?.data) {
        setInstagramAccounts(selectedPage.instagram_accounts.data);
      } else {
        setInstagramAccounts([]);
      }
    }
  }, [campaignConfig.pageId, pages]);

  const fetchConfig = async () => {
    const res = await fetch('/api/config');
    const data = await res.json();
    setConfig(data);
    if (data.adAccountId && !campaignConfig.adAccountId) {
      setCampaignConfig(prev => ({ ...prev, adAccountId: data.adAccountId }));
    }
  };

  const fetchProfiles = async () => {
    const res = await fetch('/api/profiles');
    const data = await res.json();
    setProfiles(data);
    if (data.length > 0 && !selectedProfileId) {
      setSelectedProfileId(data[0].id);
    }
  };

  const deleteProfile = async (id: string) => {
    await fetch(`/api/profiles/${id}`, { method: 'DELETE' });
    fetchProfiles();
  };

  const fetchAssets = async (profileId: string) => {
    try {
      setAdAccounts([]);
      setPages([]);
      setPixels([]);
      setInstagramAccounts([]);
      setBusinesses([]);
      
      const res = await fetch(`/api/profile/${profileId}/assets`);
      if (!res.ok) return;
      const data = await res.json();
      
      setAdAccounts(data.adAccounts || []);
      setPages(data.pages || []);
      setBusinesses(data.businesses || []);

      // Extract Instagram accounts from pages
      const igAccounts: MetaAsset[] = [];
      const seenIgIds = new Set();

      (data.pages || []).forEach((page: any) => {
        if (page.instagram_accounts?.data) {
          page.instagram_accounts.data.forEach((ig: any) => {
            if (!seenIgIds.has(ig.id)) {
              igAccounts.push({ id: ig.id, name: ig.username || ig.id });
              seenIgIds.add(ig.id);
            }
          });
        }
      });
      setInstagramAccounts(igAccounts);

    } catch (error) {
      console.error('Failed to fetch assets', error);
    }
  };

  const fetchPixels = async (profileId: string, accountId: string) => {
    try {
      const res = await fetch(`/api/profile/${profileId}/ad-account/${accountId}/pixels`);
      if (!res.ok) {
        setPixels([]);
        return;
      }
      const data = await res.json();
      setPixels(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch pixels', error);
      setPixels([]);
    }
  };

  const handleConnectMeta = async () => {
    try {
      const res = await fetch('/api/auth/url');
      const { url } = await res.json();
      window.open(url, 'meta_oauth', 'width=600,height=700');
    } catch (error) {
      console.error('Failed to get auth URL', error);
    }
  };

  const fetchUploads = async () => {
    try {
      const res = await fetch('/api/uploads');
      const contentType = res.headers.get('content-type');
      if (!res.ok) {
        let errorMessage = `HTTP error! status: ${res.status}`;
        if (contentType && contentType.includes('application/json')) {
          const errorData = await res.json();
          errorMessage = errorData.error || errorMessage;
        } else {
          const text = await res.text();
          console.error('Non-JSON error response:', text.substring(0, 500));
        }
        throw new Error(errorMessage);
      }
      
      if (!contentType || !contentType.includes('application/json')) {
        const text = await res.text();
        console.error('Expected JSON but got:', text.substring(0, 500));
        throw new Error('Servidor retornou um formato inesperado (não-JSON). Verifique os logs do servidor.');
      }

      const data = await res.json();
      setUploads(data.map((u: any) => ({ ...u, variations: [] })));
    } catch (error: any) {
      console.error('Failed to fetch uploads:', error);
      setLogs(prev => [...prev, `❌ Falha ao carregar uploads: ${error.message}`]);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    setLoading(true);
    const formData = new FormData();
    for (let i = 0; i < e.target.files.length; i++) {
      formData.append('videos', e.target.files[i]);
    }

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Erro no upload' }));
        throw new Error(errorData.error || `HTTP error! status: ${res.status}`);
      }
      
      await fetchUploads();
      setLogs(prev => [...prev, '✅ Upload concluído com sucesso']);
    } catch (error: any) {
      console.error('Upload failed', error);
      setLogs(prev => [...prev, `❌ Falha no upload: ${error.message}`]);
    } finally {
      setLoading(false);
    }
  };

  const generateVariations = async (creativeId: number) => {
    const creative = uploads.find(u => u.id === creativeId);
    if (!creative) return;

    setLoading(true);
    try {
      const res = await fetch('/api/generate-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          creativeName: creative.original_name, 
          count: campaignConfig.variationsPerCreative 
        })
      });
      const variations = await res.json();
      setUploads(prev => prev.map(u => u.id === creativeId ? { ...u, variations } : u));
    } catch (error) {
      console.error('Generation failed', error);
    } finally {
      setLoading(false);
    }
  };

  const cleanMetadata = async (id: number, copies: number) => {
    setLoading(true);
    try {
      // Simulação de limpeza de metadados e geração de cópias
      await new Promise(resolve => setTimeout(resolve, 2000));
      const original = uploads.find(u => u.id === id);
      if (!original) return;

      const newCopies: Creative[] = [];
      for (let i = 1; i <= copies; i++) {
        newCopies.push({
          ...original,
          id: Date.now() + i,
          original_name: `${original.original_name} (Clean Copy ${i})`,
          is_cleaned: true,
          variations: []
        });
      }
      setUploads(prev => [...prev, ...newCopies]);
      setLogs(prev => [...prev, `[SUCCESS] Geradas ${copies} cópias limpas para: ${original.original_name}`]);
    } catch (error) {
      console.error('Error cleaning metadata:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteUpload = async (id: number | null) => {
    if (id === null) return;
    console.log('Attempting to delete upload:', id);
    try {
      const res = await fetch(`/api/uploads/${id}`, { method: 'DELETE' });
      const data = await res.json();
      console.log('Delete response:', data);
      setUploads(prev => prev.filter(u => u.id !== id));
      setDeletingId(null);
    } catch (error) {
      console.error('Failed to delete upload', error);
    }
  };

  const renameUpload = async () => {
    if (!editingCreative) return;
    try {
      await fetch(`/api/uploads/${editingCreative.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ original_name: editingCreative.name })
      });
      setUploads(prev => prev.map(u => u.id === editingCreative.id ? { ...u, original_name: editingCreative.name } : u));
      setEditingCreative(null);
    } catch (error) {
      console.error('Failed to rename upload', error);
    }
  };

  const handleLaunch = async () => {
    if (!selectedCreativeId) return;
    const creative = uploads.find(u => u.id === selectedCreativeId);
    if (!creative) return;

    setLoading(true);
    setLogs(prev => [...prev, `🚀 Iniciando lançamento de ${launchQuantity} campanhas para: ${creative.original_name}`]);
    setLogs(prev => [...prev, `ℹ️ Budget Sharing: ${campaignConfig.budgetSharingEnabled ? 'ATIVADO' : 'DESATIVADO'}`]);
    setActiveTab('execution');

    try {
      for (let i = 1; i <= launchQuantity; i++) {
        setLogs(prev => [...prev, `[${i}/${launchQuantity}] Limpando metadados e preparando cópia...`]);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Simulação de limpeza

        const targeting = {
          geo_locations: { countries: [campaignConfig.country] },
          age_min: campaignConfig.ageMin,
          age_max: campaignConfig.ageMax,
          genders: campaignConfig.genders,
          publisher_platforms: ['facebook', 'instagram'],
          device_platforms: ['mobile', 'desktop']
        };

        const res = await fetch('/api/create-campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...campaignConfig,
            targeting,
            creatives: [{
              uploadId: creative.id,
              variations: creative.variations.length > 0 ? creative.variations : [{ title: 'Título Padrão', body: 'Corpo do anúncio padrão.' }]
            }],
            campaignName: `${campaignConfig.campaignName} - Cópia ${i} - ${Date.now()}`
          })
        });
        
        const data = await res.json();
        if (data.success) {
          setLogs(prev => [...prev, `✅ [${i}/${launchQuantity}] Campanha criada com sucesso!`]);
        } else {
          setLogs(prev => [...prev, `❌ [${i}/${launchQuantity}] Erro: ${data.error}`]);
          if (data.metaError) {
            const metaErr = data.metaError;
            if (metaErr.error_user_title) {
              setLogs(prev => [...prev, `   ⚠️ ${metaErr.error_user_title}`]);
            }
            if (metaErr.error_user_msg) {
              setLogs(prev => [...prev, `   ℹ️ ${metaErr.error_user_msg}`]);
            }
            setLogs(prev => [...prev, `   🔍 Código: ${metaErr.code} | Subcode: ${metaErr.error_subcode}`]);
          }
          // Se houver erro, paramos o loop para evitar múltiplas falhas seguidas
          setLogs(prev => [...prev, '🛑 Interrompendo processo devido ao erro.']);
          break;
        }
      }
      setLogs(prev => [...prev, '🏁 Processo de lançamento finalizado!']);
    } catch (error: any) {
      setLogs(prev => [...prev, `❌ Erro Fatal: ${error.message}`]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#141414] font-sans">
      {/* Sidebar */}
      <div className="fixed left-0 top-0 h-full w-64 bg-white border-r border-[#141414]/10 p-6 flex flex-col gap-8">
        <div className="flex items-center gap-2 px-2">
          <div className="w-8 h-8 bg-[#141414] rounded-lg flex items-center justify-center">
            <Play className="w-5 h-5 text-white fill-current" />
          </div>
          <h1 className="font-bold text-lg tracking-tight">Meta Automator</h1>
        </div>

        <nav className="flex flex-col gap-2">
          <NavItem 
            active={activeTab === 'creatives'} 
            onClick={() => setActiveTab('creatives')}
            icon={<Image size={20} />}
            label="Criativos Validados"
          />
          <NavItem 
            active={activeTab === 'launcher'} 
            onClick={() => setActiveTab('launcher')}
            icon={<Play size={20} />}
            label="Subir Campanhas"
          />
          <NavItem 
            active={activeTab === 'settings'} 
            onClick={() => setActiveTab('settings')}
            icon={<Settings size={20} />}
            label="Configuração"
          />
          <NavItem 
            active={activeTab === 'profiles'} 
            onClick={() => setActiveTab('profiles')}
            icon={<Facebook size={20} />}
            label="Perfis Meta"
          />
          <NavItem 
            active={activeTab === 'execution'} 
            onClick={() => setActiveTab('execution')}
            icon={<LayoutDashboard size={20} />}
            label="Logs"
          />
        </nav>

        <button 
          onClick={() => setShowConnectModal(true)}
          className="mt-4 flex items-center justify-center gap-2 px-4 py-3 bg-[#1877F2] text-white rounded-xl text-sm font-bold hover:bg-[#166fe5] transition-all shadow-lg shadow-blue-500/20"
        >
          <Plus size={18} />
          Adicionar Perfil
        </button>

        {selectedProfileId && (
          <button 
            onClick={() => fetchAssets(selectedProfileId)}
            className="mt-4 flex items-center justify-center gap-2 px-4 py-3 bg-[#141414]/5 text-[#141414] rounded-xl text-xs font-bold hover:bg-[#141414]/10 transition-all"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Sincronizar Ativos
          </button>
        )}

        <div className="mt-auto p-4 bg-[#141414]/5 rounded-xl text-xs flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span>Meta API</span>
            {config?.hasMetaToken ? <CheckCircle2 size={14} className="text-emerald-600" /> : <AlertCircle size={14} className="text-amber-600" />}
          </div>
          <div className="flex items-center justify-between">
            <span>Gemini AI</span>
            {config?.hasGeminiKey ? <CheckCircle2 size={14} className="text-emerald-600" /> : <AlertCircle size={14} className="text-amber-600" />}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="ml-64 p-10 max-w-6xl">
        <AnimatePresence mode="wait">
          {activeTab === 'creatives' && (
            <motion.div 
              key="creatives"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-8"
            >
              <header>
                <h2 className="text-3xl font-bold tracking-tight">Criativos Validados</h2>
                <p className="text-[#141414]/60 mt-1">Sua biblioteca de vídeos prontos para escala.</p>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <label className="border-2 border-dashed border-[#141414]/20 rounded-2xl p-8 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-[#141414]/40 transition-colors bg-white/50">
                  <input type="file" multiple accept="video/*" className="hidden" onChange={handleFileUpload} />
                  <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-sm">
                    <Upload size={24} />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold">Upload Videos</p>
                    <p className="text-xs text-[#141414]/50">MP4, MOV up to 500MB</p>
                  </div>
                </label>

                {uploads.map((creative) => (
                  <div key={creative.id} className="bg-white rounded-2xl p-5 border border-[#141414]/5 shadow-sm flex flex-col gap-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div 
                          onClick={() => setPreviewVideo(`/uploads/${creative.filename}`)}
                          className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600 cursor-pointer hover:bg-indigo-100 transition-colors"
                        >
                          <Play size={20} fill="currentColor" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate w-32">{creative.original_name}</p>
                          <button 
                            onClick={() => setEditingCreative({ id: creative.id, name: creative.original_name })}
                            className="text-[10px] uppercase tracking-wider font-bold text-indigo-600 hover:underline"
                          >
                            Renomear
                          </button>
                        </div>
                      </div>
                      <button 
                        onClick={() => setDeletingId(creative.id)}
                        className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <button 
                      onClick={() => generateVariations(creative.id)}
                      disabled={loading}
                      className="w-full py-2 bg-[#141414]/5 text-[#141414] rounded-xl text-xs font-bold hover:bg-[#141414]/10"
                    >
                      {creative.variations.length > 0 ? 'Regerar Textos' : 'Gerar Textos (IA)'}
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'launcher' && (
            <motion.div 
              key="launcher"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-8 max-w-2xl mx-auto"
            >
              <header className="text-center">
                <h2 className="text-3xl font-bold tracking-tight">Subir Campanhas</h2>
                <p className="text-[#141414]/60 mt-1">Selecione o criativo e a quantidade de lançamentos.</p>
              </header>

              <div className="bg-white rounded-[32px] p-10 border border-[#141414]/5 shadow-xl flex flex-col gap-8">
                <div className="flex flex-col gap-4">
                  <label className="text-[10px] uppercase font-bold text-[#141414]/40 tracking-wider">Selecione o Criativo Validado</label>
                  <div className="grid grid-cols-1 gap-3">
                    {uploads.map(u => (
                      <button 
                        key={u.id}
                        onClick={() => setSelectedCreativeId(u.id)}
                        className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${selectedCreativeId === u.id ? 'border-[#1877F2] bg-[#1877F2]/5' : 'border-transparent bg-[#141414]/5 hover:bg-[#141414]/10'}`}
                      >
                        <div className="flex items-center gap-3">
                          <Video size={18} className={selectedCreativeId === u.id ? 'text-[#1877F2]' : 'text-[#141414]/40'} />
                          <span className="font-bold text-sm">{u.original_name}</span>
                        </div>
                        {selectedCreativeId === u.id && <CheckCircle2 size={18} className="text-[#1877F2]" />}
                      </button>
                    ))}
                    {uploads.length === 0 && (
                      <p className="text-center py-8 text-sm text-[#141414]/40 italic">Nenhum criativo disponível. Faça upload primeiro.</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] uppercase font-bold text-[#141414]/40 tracking-wider">Quantidade de Campanhas</label>
                    <div className="flex items-center gap-4">
                      <input 
                        type="range" 
                        min="1" 
                        max="20" 
                        value={launchQuantity}
                        onChange={(e) => setLaunchQuantity(parseInt(e.target.value))}
                        className="flex-1 h-2 bg-[#141414]/10 rounded-lg appearance-none cursor-pointer accent-[#1877F2]"
                      />
                      <span className="text-2xl font-bold w-12 text-center">{launchQuantity}</span>
                    </div>
                  </div>

                  <div className="p-6 bg-[#141414] text-white rounded-2xl flex flex-col gap-2">
                    <p className="text-[10px] uppercase font-bold text-white/40 tracking-wider">Estrutura Automática</p>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Estrutura:</span>
                      <span className="font-bold">1-1-1 {campaignConfig.budgetSharingEnabled ? 'CBO' : 'ABO'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Orçamento Total:</span>
                      <span className="font-bold text-emerald-400">R$ {launchQuantity * 33}</span>
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/10">
                      <span className="text-xs text-white/60">Budget Sharing (CBO):</span>
                      <button 
                        onClick={() => {
                          const newValue = !campaignConfig.budgetSharingEnabled;
                          setCampaignConfig({
                            ...campaignConfig, 
                            budgetSharingEnabled: newValue,
                            budgetType: newValue ? 'CBO' : 'ABO'
                          });
                        }}
                        className={`w-10 h-5 rounded-full transition-all relative ${campaignConfig.budgetSharingEnabled ? 'bg-emerald-500' : 'bg-white/20'}`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${campaignConfig.budgetSharingEnabled ? 'right-0.5' : 'left-0.5'}`} />
                      </button>
                    </div>
                    <p className="text-[10px] text-white/40 mt-2 italic">* Cada campanha terá metadados limpos automaticamente.</p>
                  </div>

                  <button 
                    onClick={handleLaunch}
                    disabled={loading || !selectedCreativeId}
                    className="w-full py-5 bg-[#0064E0] text-white rounded-2xl font-bold text-lg flex items-center justify-center gap-3 hover:bg-[#0054BD] shadow-lg shadow-[#0064E0]/20 disabled:opacity-50 transition-all transform active:scale-95"
                  >
                    {loading ? <Loader2 size={24} className="animate-spin" /> : <Play size={24} fill="currentColor" />}
                    SUBIR {launchQuantity} CAMPANHAS
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-8 pb-20"
            >
              <header>
                <h2 className="text-3xl font-bold tracking-tight">Configuração de Campanhas</h2>
                <p className="text-[#141414]/60 mt-1">Defina os padrões para todos os lançamentos automáticos.</p>
              </header>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                <div className="xl:col-span-2 flex flex-col gap-6">
                  <section className="bg-white rounded-3xl p-8 border border-[#141414]/5 shadow-sm flex flex-col gap-6">
                    <div className="flex items-center gap-3 border-b border-[#141414]/5 pb-4">
                      <div className="w-10 h-10 rounded-full bg-[#0064E0]/10 flex items-center justify-center text-[#0064E0]">
                        <Settings size={20} />
                      </div>
                      <h3 className="font-bold text-lg">Padrões da Campanha</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <InputGroup 
                        label="Nome Padrão" 
                        value={campaignConfig.campaignName} 
                        onChange={(v) => setCampaignConfig({...campaignConfig, campaignName: v})} 
                      />
                      <InputGroup 
                        label="URL de Destino" 
                        placeholder="https://seusite.com"
                        value={campaignConfig.websiteUrl} 
                        onChange={(v) => setCampaignConfig({...campaignConfig, websiteUrl: v})} 
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <InputGroup 
                        label={campaignConfig.budgetSharingEnabled ? "Orçamento Diário (CBO)" : "Orçamento Diário (ABO)"} 
                        type="number"
                        value={campaignConfig.budget.toString()} 
                        onChange={(v) => setCampaignConfig({...campaignConfig, budget: parseInt(v)})} 
                      />
                      <InputGroup 
                        label="Idade Mín" 
                        type="number"
                        value={campaignConfig.ageMin.toString()} 
                        onChange={(v) => setCampaignConfig({...campaignConfig, ageMin: parseInt(v)})} 
                      />
                      <InputGroup 
                        label="Idade Máx" 
                        type="number"
                        value={campaignConfig.ageMax.toString()} 
                        onChange={(v) => setCampaignConfig({...campaignConfig, ageMax: parseInt(v)})} 
                      />
                    </div>

                    <div className="flex items-center gap-4 p-4 bg-[#141414]/5 rounded-2xl">
                      <div className="flex-1">
                        <h4 className="font-bold text-sm">Otimização de Orçamento da Campanha (CBO)</h4>
                        <p className="text-[10px] text-[#141414]/60">O orçamento será definido no nível da campanha e distribuído automaticamente entre os conjuntos de anúncios.</p>
                      </div>
                      <button 
                        onClick={() => setCampaignConfig({...campaignConfig, budgetSharingEnabled: !campaignConfig.budgetSharingEnabled})}
                        className={`w-12 h-6 rounded-full transition-all relative ${campaignConfig.budgetSharingEnabled ? 'bg-emerald-500' : 'bg-[#141414]/20'}`}
                      >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${campaignConfig.budgetSharingEnabled ? 'right-1' : 'left-1'}`} />
                      </button>
                    </div>
                  </section>

                  <section className="bg-white rounded-3xl p-8 border border-[#141414]/5 shadow-sm flex flex-col gap-6">
                    <div className="flex items-center gap-3 border-b border-[#141414]/5 pb-4">
                      <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                        <Users size={20} />
                      </div>
                      <h3 className="font-bold text-lg">Ativos Meta</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <SelectGroup 
                        label="Página Facebook" 
                        value={campaignConfig.pageId} 
                        options={pages}
                        onChange={(v) => setCampaignConfig({...campaignConfig, pageId: v})} 
                      />
                      <SelectGroup 
                        label="Pixel" 
                        value={campaignConfig.pixelId} 
                        options={pixels}
                        onChange={(v) => setCampaignConfig({...campaignConfig, pixelId: v})} 
                      />
                    </div>
                  </section>
                </div>

                <div className="flex flex-col gap-6">
                  <div className="bg-white rounded-3xl p-8 border border-[#141414]/5 shadow-sm flex flex-col gap-6">
                    <h3 className="font-bold text-lg">Ativos Conectados</h3>
                    <div className="space-y-4">
                      <SelectGroup 
                        label="Perfil Ativo" 
                        value={selectedProfileId} 
                        options={profiles.map(p => ({ id: p.id, name: p.name }))}
                        onChange={(v) => setSelectedProfileId(v)} 
                      />
                      <SelectGroup 
                        label="Business Manager" 
                        value={campaignConfig.businessId} 
                        options={businesses}
                        onChange={(v) => setCampaignConfig({...campaignConfig, businessId: v})} 
                      />
                      <SelectGroup 
                        label="Conta de Anúncios" 
                        value={campaignConfig.adAccountId} 
                        options={adAccounts}
                        onChange={(v) => setCampaignConfig({...campaignConfig, adAccountId: v})} 
                      />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'profiles' && (
            <motion.div 
              key="profiles"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-8"
            >
              <header className="flex items-center justify-between">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight">Perfis Meta</h2>
                  <p className="text-[#141414]/60 mt-1">Gerencie múltiplos perfis do Meta Ads.</p>
                </div>
                <button 
                  onClick={() => setShowConnectModal(true)}
                  className="px-6 py-3 bg-[#141414] text-white rounded-xl font-bold flex items-center gap-2 hover:bg-[#141414]/90"
                >
                  <Plus size={20} />
                  Novo Perfil
                </button>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {profiles.map((profile) => (
                  <div 
                    key={profile.id} 
                    className={`bg-white rounded-3xl p-6 border-2 transition-all ${selectedProfileId === profile.id ? 'border-[#1877F2]' : 'border-transparent shadow-sm'}`}
                  >
                    <div className="flex items-center gap-4 mb-6">
                      <img src={profile.picture_url} alt={profile.name} className="w-12 h-12 rounded-full border border-[#141414]/10" />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold truncate">{profile.name}</p>
                        <p className="text-[10px] text-[#141414]/40 uppercase font-bold tracking-wider">ID: {profile.id}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setSelectedProfileId(profile.id)}
                        className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${selectedProfileId === profile.id ? 'bg-[#1877F2] text-white' : 'bg-[#141414]/5 text-[#141414] hover:bg-[#141414]/10'}`}
                      >
                        {selectedProfileId === profile.id ? 'Selecionado' : 'Selecionar'}
                      </button>
                      <button 
                        onClick={() => deleteProfile(profile.id)}
                        className="p-2.5 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-all"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'execution' && (
            <motion.div 
              key="execution"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-8"
            >
              <header className="flex items-center justify-between">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight">Logs de Execução</h2>
                  <p className="text-[#141414]/60 mt-1">Status em tempo real das operações na API do Meta.</p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      const text = logs.join('\n');
                      navigator.clipboard.writeText(text);
                    }}
                    className="px-4 py-2 bg-[#141414]/5 text-[#141414] rounded-xl text-xs font-bold hover:bg-[#141414]/10 transition-all flex items-center gap-2"
                  >
                    <Copy size={14} />
                    Copiar Logs
                  </button>
                  <button 
                    onClick={() => setLogs([])}
                    className="px-4 py-2 bg-[#141414]/5 text-[#141414] rounded-xl text-xs font-bold hover:bg-[#141414]/10 transition-all flex items-center gap-2"
                  >
                    <Trash2 size={14} />
                    Limpar Logs
                  </button>
                </div>
              </header>

              <div className="bg-[#141414] rounded-3xl p-8 font-mono text-xs text-white/80 min-h-[400px] flex flex-col gap-2 overflow-y-auto max-h-[600px]">
                {logs.length === 0 && <p className="text-white/20 italic">Nenhuma operação em andamento...</p>}
                {logs.map((log, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="text-white/20">[{new Date().toLocaleTimeString()}]</span>
                    <span className={log.startsWith('✅') ? 'text-emerald-400' : log.startsWith('❌') ? 'text-red-400' : ''}>
                      {log}
                    </span>
                  </div>
                ))}
                {loading && (
                  <div className="flex items-center gap-2 text-white/40 mt-2">
                    <Loader2 size={14} className="animate-spin" />
                    <span>Processando próxima operação...</span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <ConnectModal 
        isOpen={showConnectModal} 
        onClose={() => setShowConnectModal(false)} 
        onConnect={handleConnectMeta}
      />

      {/* Video Preview Modal */}
      <AnimatePresence>
        {previewVideo && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPreviewVideo(null)}
              className="absolute inset-0 bg-[#141414]/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-4xl aspect-video bg-black rounded-3xl overflow-hidden shadow-2xl"
            >
              <button 
                onClick={() => setPreviewVideo(null)}
                className="absolute top-6 right-6 z-10 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
              >
                <Plus size={24} className="rotate-45" />
              </button>
              <video 
                src={previewVideo} 
                controls 
                autoPlay 
                className="w-full h-full object-contain"
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Rename Modal */}
      <AnimatePresence>
        {editingCreative && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingCreative(null)}
              className="absolute inset-0 bg-[#141414]/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[32px] p-8 shadow-2xl"
            >
              <h3 className="text-xl font-bold mb-6">Renomear Criativo</h3>
              <div className="flex flex-col gap-6">
                <InputGroup 
                  label="Novo Nome" 
                  value={editingCreative.name} 
                  onChange={(v) => setEditingCreative({ ...editingCreative, name: v })} 
                />
                <div className="flex gap-3">
                  <button 
                    onClick={() => setEditingCreative(null)}
                    className="flex-1 py-3 bg-[#141414]/5 text-[#141414] rounded-xl font-bold hover:bg-[#141414]/10"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={renameUpload}
                    className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-600/20"
                  >
                    Salvar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deletingId !== null && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeletingId(null)}
              className="absolute inset-0 bg-[#141414]/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[32px] p-8 shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-bold mb-2">Excluir Criativo?</h3>
              <p className="text-[#141414]/60 text-sm mb-8">Esta ação não pode ser desfeita. O arquivo será removido permanentemente.</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setDeletingId(null)}
                  className="flex-1 py-3 bg-[#141414]/5 text-[#141414] rounded-xl font-bold hover:bg-[#141414]/10"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => deleteUpload(deletingId)}
                  className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 shadow-lg shadow-red-500/20"
                >
                  Excluir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ConnectModal({ isOpen, onClose, onConnect }: { isOpen: boolean, onClose: () => void, onConnect: () => void }) {
  const [copying, setCopying] = useState(false);

  const handleCopyLink = async () => {
    try {
      const res = await fetch('/api/auth/url');
      const { url } = await res.json();
      await navigator.clipboard.writeText(url);
      setCopying(true);
      setTimeout(() => setCopying(false), 2000);
    } catch (error) {
      console.error('Failed to copy link', error);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-[#141414]/60 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-[#1D2230] rounded-[32px] p-10 text-white shadow-2xl overflow-hidden"
          >
            <button onClick={onClose} className="absolute top-6 right-6 text-white/40 hover:text-white transition-colors">
              <Plus size={24} className="rotate-45" />
            </button>

            <div className="flex flex-col items-center text-center gap-8">
              <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center">
                <Facebook size={32} fill="currentColor" className="text-[#1877F2]" />
              </div>

              <div>
                <h3 className="text-2xl font-bold mb-2">Conectar Meta Ads</h3>
                <p className="text-white/60 text-sm">Escolha como deseja conectar sua conta Meta Ads</p>
              </div>

              <div className="w-full flex flex-col gap-4">
                <button 
                  onClick={onConnect}
                  className="w-full py-4 bg-[#1877F2] rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-[#166fe5] transition-all"
                >
                  <ChevronRight size={20} className="rotate-[-45deg]" />
                  Continuar neste navegador
                </button>
                <p className="text-[10px] text-white/40">Conecte sua conta Meta Ads diretamente neste navegador</p>

                <button 
                  onClick={handleCopyLink}
                  className="w-full py-4 bg-white/5 border border-white/10 rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-white/10 transition-all"
                >
                  {copying ? <CheckCircle2 size={20} className="text-emerald-400" /> : <Copy size={20} />}
                  {copying ? 'Link Copiado!' : 'Copiar link para navegador multilogin'}
                </button>
                <p className="text-[10px] text-white/40">Gere um link para conectar em outro navegador ou compartilhar com colaboradores</p>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function NavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
        active 
          ? 'bg-[#141414] text-white shadow-lg shadow-[#141414]/20' 
          : 'text-[#141414]/60 hover:bg-[#141414]/5'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function InputGroup({ label, value, onChange, type = "text", placeholder }: { label: string, value: string, onChange: (v: string) => void, type?: string, placeholder?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] uppercase font-bold text-[#141414]/40 tracking-wider">{label}</label>
      <input 
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-2.5 bg-[#141414]/5 rounded-xl border-none text-sm focus:ring-2 focus:ring-[#141414]/10"
      />
    </div>
  );
}

function SelectGroup({ label, value, options, onChange }: { label: string, value: string, options: { id: string, name: string }[], onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] uppercase font-bold text-[#141414]/40 tracking-wider">{label}</label>
      <select 
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-2.5 bg-[#141414]/5 rounded-xl border-none text-sm focus:ring-2 focus:ring-[#141414]/10 appearance-none"
      >
        <option value="">Selecionar...</option>
        {Array.isArray(options) && options.map(opt => (
          <option key={opt.id} value={opt.id}>{opt.name}</option>
        ))}
      </select>
    </div>
  );
}
