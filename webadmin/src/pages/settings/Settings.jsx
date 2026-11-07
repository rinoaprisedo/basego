import { useEffect, useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Save, Building2, Palette, LogIn, Wrench, Check, Rows3 } from 'lucide-react'
import Tabs from '../../components/ui/Tabs'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import Skeleton from '../../components/ui/Skeleton'
import FileUpload from '../../components/ui/FileUpload'
import { Menubar, MenubarAction, MenubarLabel, MenubarSeparator } from '../../components/ui/Menubar'
import { getSettings, updateSettings, uploadSetting } from '../../api/settings'
import { fileURL } from '../../utils/url'
import { cn } from '../../utils/cn'
import PageToolbar from '../../components/ui/PageToolbar'
import { THEMES, findTheme, DEFAULT_THEME } from '../../utils/themes'
import usePageActions from '../../hooks/usePageActions'
import useSettingsStore from '../../store/settingsStore'

const tabs = ['General', 'Maintenance']

function Section({ icon: Icon, title, description, children }) {
  return (
    <section className="overflow-hidden rounded-xl border border-surface-border bg-surface-card shadow-card">
      <div className="flex items-center gap-3 border-b border-surface-border bg-primary/[0.05] px-5 py-3.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-white">
          <Icon size={17} />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          <p className="text-xs text-text-tertiary">{description}</p>
        </div>
      </div>
      <div className="space-y-5 p-5">{children}</div>
    </section>
  )
}

const isHex = (v) => /^#[0-9a-f]{6}$/i.test(v)

function ColorInput({ label, hint, value, onChange, placeholder, onReset }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-[.05em] text-text-secondary">{label}</p>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={isHex(value) ? value : '#ffffff'}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-14 cursor-pointer rounded-md border border-surface-border bg-transparent p-1"
          aria-label={`${label} picker`}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-32 uppercase"
          maxLength={7}
        />
        {onReset && (
          <Button variant="secondary" onClick={onReset}>
            Reset
          </Button>
        )}
      </div>
      <p className="mt-1 text-xs text-text-tertiary">{hint}</p>
    </div>
  )
}

function ThemeCard({ theme, active, onSelect }) {
  const light = theme.sidebar.toLowerCase() === '#ffffff'
  return (
    <button
      type="button"
      onClick={() => onSelect(theme)}
      className={cn(
        'group relative overflow-hidden rounded-xl border bg-surface-card text-left transition-all hover:-translate-y-0.5 hover:shadow-md',
        active ? 'border-primary ring-2 ring-primary/40' : 'border-surface-border',
      )}
    >
      <div className="flex h-20 bg-surface-bg">
        <div
          className={cn('flex w-1/3 flex-col gap-1.5 p-2', light && 'border-r border-surface-border')}
          style={{ backgroundColor: theme.sidebar }}
        >
          <span className="h-1.5 w-8 rounded-full" style={{ backgroundColor: light ? '#cbd5e1' : 'rgba(255,255,255,.35)' }} />
          <span className="h-3 rounded-md" style={{ backgroundColor: theme.primary }} />
          <span className="h-1.5 w-6 rounded-full" style={{ backgroundColor: light ? '#e2e8f0' : 'rgba(255,255,255,.2)' }} />
        </div>
        <div className="flex flex-1 flex-col gap-1.5 p-2">
          <span className="h-1.5 w-10 rounded-full bg-text-tertiary/40" />
          <span className="h-6 rounded-md border border-surface-border bg-surface-card" />
          <span className="ml-auto h-3 w-8 rounded-md" style={{ backgroundColor: theme.primary }} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="truncate text-[13px] font-medium text-text-primary">{theme.name}</span>
        <span className="flex shrink-0 -space-x-1">
          <span className="h-4 w-4 rounded-full border border-surface-card" style={{ backgroundColor: theme.primary }} />
          <span className="h-4 w-4 rounded-full border border-surface-border" style={{ backgroundColor: theme.sidebar }} />
        </span>
      </div>
      {active && (
        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
          <Check size={12} />
        </span>
      )}
    </button>
  )
}

// Renders *highlighted* words with the brand gradient, same markup as the login page.
function Highlighted({ text }) {
  return text.split('*').map((part, i) =>
    i % 2 ? (
      <span key={i} className="text-gradient">
        {part}
      </span>
    ) : (
      part
    ),
  )
}

function Settings() {
  const [tab, setTab] = useState('General')
  const [appName, setAppName] = useState('')
  const [maintenance, setMaintenance] = useState(false)
  const [logoPreview, setLogoPreview] = useState(null)
  const [faviconPreview, setFaviconPreview] = useState(null)
  const [primaryColor, setPrimaryColorInput] = useState(DEFAULT_THEME.primary)
  const [sidebarColor, setSidebarColorInput] = useState(DEFAULT_THEME.sidebar)
  const [pageSize, setPageSize] = useState('10')
  const [loginText, setLoginText] = useState({ login_badge: '', login_headline: '', login_description: '' })
  const queryClient = useQueryClient()
  const applyPrimaryColorLive = useSettingsStore((s) => s.setPrimaryColor)
  const applySidebarColorLive = useSettingsStore((s) => s.setSidebarColor)

  const { data, isLoading } = useQuery({ queryKey: ['settings'], queryFn: getSettings })

  useEffect(() => {
    if (data?.data) {
      // GET /settings returns a { key: value } map directly, not an array.
      const map = data.data
      setAppName(map.app_name || '')
      setMaintenance(map.maintenance_mode === 'true' || map.maintenance_mode === true)
      setLogoPreview(fileURL(map.app_logo))
      setFaviconPreview(fileURL(map.app_favicon))
      setPrimaryColorInput(map.primary_color || DEFAULT_THEME.primary)
      setSidebarColorInput(map.sidebar_color || DEFAULT_THEME.sidebar)
      setPageSize(String(map.default_page_size || 10))
      setLoginText({
        login_badge: map.login_badge ?? '',
        login_headline: map.login_headline ?? '',
        login_description: map.login_description ?? '',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const activeTheme = findTheme(primaryColor, sidebarColor)

  const handlePrimaryColorChange = (hex) => {
    setPrimaryColorInput(hex)
    if (isHex(hex)) applyPrimaryColorLive(hex)
  }

  const handleSidebarColorChange = (hex) => {
    setSidebarColorInput(hex)
    if (hex === '' || isHex(hex)) applySidebarColorLive(hex)
  }

  const selectTheme = (t) => {
    setPrimaryColorInput(t.primary)
    setSidebarColorInput(t.sidebar)
    applyPrimaryColorLive(t.primary) // live preview across the app before saving
    applySidebarColorLive(t.sidebar)
  }

  const saveMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      toast.success('Settings saved')
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      useSettingsStore.getState().fetchSettings()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Save failed'),
  })

  const uploadMutation = useMutation({
    mutationFn: uploadSetting,
    onSuccess: () => {
      toast.success('File uploaded')
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      useSettingsStore.getState().fetchSettings()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Upload failed'),
  })

  const handleFileChange = (key) => (file) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('target', key)
    uploadMutation.mutate(formData)
    const reader = new FileReader()
    reader.onload = () => (key === 'app_logo' ? setLogoPreview(reader.result) : setFaviconPreview(reader.result))
    reader.readAsDataURL(file)
  }

  const saveGeneral = () => {
    const size = Number(pageSize)
    if (!Number.isInteger(size) || size < 1 || size > 200) return toast.error('Rows per page must be a whole number from 1 to 200')
    if (!isHex(primaryColor)) return toast.error('Base color must be a hex value like #ec4141')
    if (sidebarColor !== '' && !isHex(sidebarColor)) return toast.error('Sidebar color must be a hex value or empty')
    saveMutation.mutate({
      app_name: appName,
      primary_color: primaryColor,
      sidebar_color: sidebarColor,
      default_page_size: String(size),
      ...loginText,
    })
  }

  usePageActions(
    useMemo(
      () => (
        <Menubar>
          <MenubarLabel>Settings</MenubarLabel>
          {tab === 'General' && (
            <>
              <MenubarSeparator />
              <MenubarAction
                label={saveMutation.isPending ? 'Saving...' : 'Save Changes'}
                icon={Save}
                onClick={saveGeneral}
              />
            </>
          )}
        </Menubar>
      ),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [tab, saveMutation.isPending, appName, primaryColor, sidebarColor, pageSize, loginText],
    ),
  )

  if (isLoading) return <Skeleton className="h-96 w-full" />

  return (
    <div className="space-y-4">
      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      <div className="max-w-3xl space-y-4">
        <div className="rounded-lg border border-surface-border bg-surface-card shadow-card">
          <PageToolbar />
        </div>

        {tab === 'General' && (
          <>
            <Section icon={Building2} title="Brand" description="Name, logo and favicon shown across the app.">
              <Input label="App Name" value={appName} onChange={(e) => setAppName(e.target.value)} />
              <div className="grid gap-4 sm:grid-cols-2">
                <FileUpload
                  label="Logo"
                  hint="PNG, JPEG or WebP · uploaded instantly"
                  accept="image/png,image/jpeg,image/webp"
                  preview={logoPreview}
                  onFileSelect={handleFileChange('app_logo')}
                  previewClassName="h-16 w-16"
                />
                <FileUpload
                  label="Favicon"
                  hint="PNG, JPEG or WebP · uploaded instantly"
                  accept="image/png,image/jpeg,image/webp"
                  preview={faviconPreview}
                  onFileSelect={handleFileChange('app_favicon')}
                  previewClassName="h-16 w-16"
                />
              </div>
            </Section>

            <Section icon={Palette} title="Theme" description="Pick a ready-made color package, or set colors manually. Previewed instantly; saved with Save Changes.">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {THEMES.map((t) => (
                  <ThemeCard key={t.id} theme={t} active={activeTheme?.id === t.id} onSelect={selectTheme} />
                ))}
              </div>
              <div className="border-t border-surface-border pt-5">
                <p className="mb-3 text-sm font-medium text-text-primary">Custom colors</p>
                <div className="grid gap-5 sm:grid-cols-2">
                  <ColorInput
                    label="Base color"
                    hint="Buttons, links, highlights and accents."
                    value={primaryColor}
                    onChange={handlePrimaryColorChange}
                    placeholder="#000000"
                  />
                  <ColorInput
                    label="Sidebar color"
                    hint="Text and hover shades adjust automatically. Empty = theme default."
                    value={sidebarColor}
                    onChange={handleSidebarColorChange}
                    placeholder="Default"
                    onReset={() => handleSidebarColorChange('')}
                  />
                </div>
              </div>
            </Section>

            <Section icon={Rows3} title="Lists" description="Defaults for tables across the app.">
              <div className="max-w-xs">
                <Input
                  label="Default rows per page"
                  type="number"
                  min={1}
                  max={200}
                  step={1}
                  value={pageSize}
                  onChange={(e) => setPageSize(e.target.value)}
                />
                <p className="mt-1.5 text-xs text-text-tertiary">
                  Any number from 1 to 200. Applies the next time a list is opened; you can still change it per table.
                </p>
              </div>
            </Section>

            <Section icon={LogIn} title="Login page" description="Text on the sign-in screen.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Badge"
                  value={loginText.login_badge}
                  onChange={(e) => setLoginText((t) => ({ ...t, login_badge: e.target.value }))}
                  maxLength={40}
                />
                <Input
                  label="Headline"
                  value={loginText.login_headline}
                  onChange={(e) => setLoginText((t) => ({ ...t, login_headline: e.target.value }))}
                  maxLength={120}
                />
              </div>
              <Input
                label="Description"
                value={loginText.login_description}
                onChange={(e) => setLoginText((t) => ({ ...t, login_description: e.target.value }))}
                maxLength={240}
              />
              <p className="-mt-2 text-xs text-text-tertiary">
                Wrap words in *asterisks* to highlight them with the gradient. Empty badge hides it.
              </p>
              <div className="rounded-lg border border-dashed border-surface-border bg-surface-hover/40 p-4">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.08em] text-text-tertiary">Preview</p>
                {loginText.login_badge && (
                  <span className="mb-2 inline-block rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[.08em] text-primary">
                    {loginText.login_badge}
                  </span>
                )}
                <div className="text-lg font-bold leading-snug text-text-primary">
                  <Highlighted text={loginText.login_headline} />
                </div>
                <p className="mt-1 text-sm text-text-secondary">{loginText.login_description}</p>
              </div>
            </Section>

            <div className="flex justify-end">
              <Button onClick={saveGeneral} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </>
        )}

        {tab === 'Maintenance' && (
          <Section icon={Wrench} title="Maintenance mode" description="Temporarily block non-admin access.">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={maintenance}
                onChange={(e) => setMaintenance(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              <span className="text-sm text-text-primary">Enable maintenance mode</span>
            </label>
            <Button
              onClick={() => saveMutation.mutate({ maintenance_mode: maintenance })}
              disabled={saveMutation.isPending}
            >
              Save
            </Button>
          </Section>
        )}
      </div>
    </div>
  )
}

export default Settings
