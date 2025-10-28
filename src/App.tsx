import { useRef, useState, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import logo from "./assets/image.png";

// ---------- ENV ----------
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!
)

// Webhook padrão (fallback)
const N8N_URL_DEFAULT = import.meta.env.VITE_N8N_WEBHOOK!;

// Webhooks por cliente (opcionais)
const VITE_N8N_WEBHOOK = import.meta.env.VITE_N8N_WEBHOOK_RETAIL as string | undefined;
const VITE_N8N_WEBHOOK_AUTO   = import.meta.env.VITE_N8N_WEBHOOK_AUTO   as string | undefined;
// adicione outros clientes aqui se quiser…

// ---------- CLIENTES DISPONÍVEIS ----------
type ClientId = 'retail' | 'auto';

const CLIENTS: { id: ClientId; label: string; webhook?: string }[] = [
  { id: 'retail', label: 'Retail', webhook: VITE_N8N_WEBHOOK },
  { id: 'auto',   label: 'Auto',   webhook: VITE_N8N_WEBHOOK_AUTO },
];

// ---------- REGRAS DE ARQUIVO ----------
const ACCEPTED = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  '.xlsx',
  '.csv',
] as const;

const MAX_MB = 50;
const acceptStr = '.csv,.xlsx';
const acceptListForFooter = '.csv, .xlsx';
const maxSizeMB = MAX_MB;

const prettyBytes = (bytes: number) => {
  const units = ['B','KB','MB','GB']; let i=0, v=bytes
  while (v>=1024 && i<units.length-1){ v/=1024; i++ }
  return `${v.toFixed(1)} ${units[i]}`
}

export default function App() {
  const inputRef = useRef<HTMLInputElement|null>(null)

  const [file, setFile] = useState<File|null>(null)
  const [status, setStatus] = useState<'idle'|'uploading'|'notifying'|'success'|'error'>('idle')
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState('')
  const [dragOver, setDragOver] = useState(false)

  // novo: cliente selecionado (default: retail)
  const [client, setClient] = useState<ClientId>('retail')

  // Resolve o webhook para o cliente escolhido; se não houver específico, usa o padrão
  const resolvedWebhook = useMemo(() => {
    const found = CLIENTS.find(c => c.id === client)
    return (found?.webhook || N8N_URL_DEFAULT) ?? '(Webhook não configurado)'
  }, [client])

  const onBrowse = () => inputRef.current?.click()

  const validateFile = (f: File) => {
    if (f.size > MAX_MB*1024*1024) { setStatus('error'); setMessage(`Tamanho máximo: ${MAX_MB} MB`); return false }
    const ok = ACCEPTED.some(a => f.type===a || f.name.toLowerCase().endsWith(a as string))
    if (!ok) { setStatus('error'); setMessage('Tipo inválido. Use .xlsx ou .csv'); return false }
    return true
  }

  const handleFiles = (files: FileList|null) => {
    if(!files?.length) return
    const f = files[0]
    if (!validateFile(f)) return
    setFile(f); setStatus('idle'); setMessage('')
  }

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  const onUpload = async () => {
    if (!file) return
    setStatus('uploading'); setProgress(8); setMessage('')

    try {
      // pasta por cliente -> public/<client>/
      const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
      const key = `public/${client}/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`

      // progresso "fake" enquanto o fetch roda
      const tick = setInterval(() => setProgress(p => (p < 78 ? p + 2 : p)), 200)

      const { error } = await supabase.storage
        .from('uploads')
        .upload(key, file, { contentType: file.type, upsert: false })

      clearInterval(tick)
      if (error) {
        const msg = error?.message?.includes('duplicate')
          ? 'Já existe um arquivo com esse nome. Tente novamente.'
          : error.message || 'Falha ao enviar para o storage'
        throw new Error(msg)
      }

      setProgress(85)

      const { data } = supabase.storage.from('uploads').getPublicUrl(key)
      const fileUrl = data.publicUrl

      setStatus('notifying')

          // envia como multipart/form-data (sem headers)
      const fd = new FormData();
      fd.append('client', client);
      fd.append('url', fileUrl);
      fd.append('filename', file.name);
      fd.append('mimetype', file.type || 'application/octet-stream');
      fd.append('size', String(file.size));
      fd.append('source', 'supabase');

      const r = await fetch(resolvedWebhook, {
        method: 'POST',
        body: fd,                     // <-- sem headers
        // credentials: 'omit'        // deixe omit a não ser que precise de cookies
      });
      if (!r.ok) throw new Error(`Falha ao notificar n8n (${r.status})`);

      setProgress(100)
      setStatus('success')
      setMessage(`✅ Enviado e notificado para ${client.toUpperCase()}!`)
      setFile(null)
    } catch (e:any) {
      setStatus('error')
      setMessage(e?.message || 'Falha no upload')
    }
  }

  return (
    <div
      className="min-h-screen w-full flex items-start justify-center p-6 pt-24"
      style={{ background: "linear-gradient(135deg, var(--aca-bg,#0C0C0E) 0%, #0F0F13 100%)", color: "var(--aca-text,#EDEDF2)" }}
    >
      {/* Header */}
      <header className="fixed top-0 left-0 w-full z-50 flex items-center px-6 py-4">
        <img src={logo} alt="Logo Aconcaia" className="h-2 md:h-4 object-contain" />
      </header>

      {/* Caixa flutuante de seleção de cliente */}
      <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50">
        <div className="rounded-xl border border-white/10 bg-[color:var(--aca-card,#121316)] shadow-lg px-4 py-3 min-w-[220px]">
          <div className="text-xs text-[color:var(--aca-muted,#9BA0A6)] mb-1">Cliente</div>
          <select
            value={client}
            onChange={(e) => setClient(e.target.value as ClientId)}
            className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none"
          >
            {CLIENTS.map(c => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          <div className="mt-2 text-[10px] text-[color:var(--aca-muted,#9BA0A6)] break-all">
            destino: <code>{resolvedWebhook}</code>
          </div>
        </div>
      </div>

      <div className="w-full max-w-3xl">
        <div className="rounded-2xl md:rounded-3xl shadow-[0_10px_30px_rgba(0,0,0,0.25)] border border-white/10"
             style={{ background: "var(--aca-card,#121316)" }}>
          <div className="p-6 md:p-10">
            <div className="mb-6 md:mb-8">
              <h1 className="text-2xl md:text-4xl font-semibold tracking-tight">Atualizar Dados do Dashboard</h1>
              <p className="text-sm md:text-base mt-2 text-[color:var(--aca-muted,#9BA0A6)]">
                Envie um <span className="font-medium">.csv</span> ou <span className="font-medium">.xlsx</span>.
              </p>
              <p className="text-[11px] mt-2 opacity-70">Destino: <code>{resolvedWebhook}</code></p>
            </div>

            {/* Dropzone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={[
                "relative flex flex-col items-center justify-center gap-3",
                "rounded-xl border-2 border-dashed px-6 py-10 md:py-16 text-center transition-all",
                "md:h-[260px]",
                dragOver ? "border-[color:var(--aca-primary,#7C3AED)] bg-white/5" : "border-white/15 hover:border-white/25",
              ].join(" ")}
            >
              <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-inner"
                   style={{ background: "linear-gradient(180deg, var(--aca-primary,#7C3AED), var(--aca-primary-2,#A78BFA))" }}>
                <UploadCloud className="w-7 h-7 text-white" />
              </div>
              <p className="text-base md:text-lg">Arraste e solte o arquivo aqui</p>
              <p className="text-sm text-[color:var(--aca-muted,#9BA0A6)]">ou</p>
              <button
                type="button"
                onClick={onBrowse}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 font-medium text-white disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                style={{ background: "var(--aca-primary,#7C3AED)" }}
                disabled={status === "uploading"}
              >
                <FileSpreadsheet className="w-4 h-4" />
                Selecionar arquivo
              </button>
              <input
                ref={inputRef}
                type="file"
                accept={acceptStr}
                onChange={(e) => handleFiles(e.target.files)}
                className="hidden"
              />
            </div>

            {/* Arquivo selecionado + barra de progresso */}
            {file && (
              <div className="mt-5 rounded-lg border border-white/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-[color:var(--aca-muted,#9BA0A6)]">{prettyBytes(file.size)}</p>
                  </div>
                  <button
                    onClick={onUpload}
                    className="inline-flex items-center gap-2 rounded-lg px-4 py-2 font-medium text-white disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                    style={{ background: "var(--aca-primary,#7C3AED)" }}
                    disabled={status === "uploading"}
                  >
                    {status === "uploading" ? (<><Loader2 className="w-4 h-4 animate-spin" />Enviando...</>) : (<>Enviar</>)}
                  </button>
                </div>
                {status === "uploading" && (
                  <div className="mt-3 w-full h-2 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full" style={{
                      width: `${progress}%`,
                      background: "linear-gradient(90deg, var(--aca-primary,#7C3AED), var(--aca-primary-2,#A78BFA))",
                    }} />
                  </div>
                )}
              </div>
            )}

            {/* Mensagens */}
            {status === "success" && (
              <div className="mt-5 flex items-center gap-3 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-3 text-emerald-300">
                <CheckCircle2 className="w-5 h-5" />
                <p className="text-sm">{message || "Upload concluído com sucesso."}</p>
              </div>
            )}
            {status === "error" && (
              <div className="mt-5 flex items-center gap-3 rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-red-300">
                <AlertTriangle className="w-5 h-5" />
                <p className="text-sm">{message || "Não foi possível concluir o upload."}</p>
              </div>
            )}

            {/* Rodapé */}
            <div className="mt-6 text-xs text-[color:var(--aca-muted,#9BA0A6)]">
              <p>Formatos aceitos: {acceptListForFooter} • Limite {maxSizeMB} MB</p>
              <p className="mt-1">Dica: mantenha os nomes das colunas estáveis para facilitar o ETL no n8n.</p>
            </div>
          </div>
        </div>

        <div className="text-center text-[11px] mt-4 text-[color:var(--aca-muted,#9BA0A6)]">
          <span>Interface de Aconcaia · Upload → Supabase → n8n → SQL → Dashboard</span>
        </div>
      </div>
    </div>
  );
}
