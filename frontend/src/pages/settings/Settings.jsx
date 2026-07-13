import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import Skeleton from '../../components/ui/Skeleton'
import { getSettings, updateSettings, uploadSetting } from '../../api/settings'
import { fileURL } from '../../utils/url'

const tabs = ['General', 'Appearance', 'Maintenance']

function Settings() {
  const [tab, setTab] = useState('General')
  const [appName, setAppName] = useState('')
  const [maintenance, setMaintenance] = useState(false)
  const [logoPreview, setLogoPreview] = useState(null)
  const [faviconPreview, setFaviconPreview] = useState(null)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({ queryKey: ['settings'], queryFn: getSettings })

  useEffect(() => {
    if (data?.data) {
      // GET /settings returns a { key: value } map directly, not an array.
      const map = data.data
      setAppName(map.app_name || '')
      setMaintenance(map.maintenance_mode === 'true' || map.maintenance_mode === true)
      setLogoPreview(fileURL(map.app_logo))
      setFaviconPreview(fileURL(map.app_favicon))
    }
  }, [data])

  const saveMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      toast.success('Settings saved')
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Save failed'),
  })

  const uploadMutation = useMutation({
    mutationFn: uploadSetting,
    onSuccess: () => {
      toast.success('File uploaded')
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Upload failed'),
  })

  const handleFileChange = (key) => (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    formData.append('target', key)
    uploadMutation.mutate(formData)
    const reader = new FileReader()
    reader.onload = () => (key === 'app_logo' ? setLogoPreview(reader.result) : setFaviconPreview(reader.result))
    reader.readAsDataURL(file)
  }

  if (isLoading) return <Skeleton className="h-96 w-full" />

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-text-primary">Settings</h1>

      <div className="flex gap-1 border-b border-surface-border">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium ${
              tab === t ? 'border-b-2 border-primary text-primary' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-surface-border bg-surface-card p-6">
        {tab === 'General' && (
          <div className="max-w-md space-y-4">
            <Input label="App Name" value={appName} onChange={(e) => setAppName(e.target.value)} />
            <Button onClick={() => saveMutation.mutate({ app_name: appName })} disabled={saveMutation.isPending}>
              Save
            </Button>
          </div>
        )}

        {tab === 'Appearance' && (
          <div className="max-w-md space-y-6">
            <div>
              <p className="mb-2 text-sm font-medium text-text-primary">Logo</p>
              {logoPreview && <img src={logoPreview} alt="logo" className="mb-2 h-16 w-16 object-contain" />}
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileChange('app_logo')} />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-text-primary">Favicon</p>
              {faviconPreview && <img src={faviconPreview} alt="favicon" className="mb-2 h-8 w-8 object-contain" />}
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileChange('app_favicon')} />
            </div>
          </div>
        )}

        {tab === 'Maintenance' && (
          <div className="max-w-md space-y-4">
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
          </div>
        )}
      </div>
    </div>
  )
}

export default Settings
