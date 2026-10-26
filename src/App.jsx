import { useEffect } from 'react'
import { BottomNav, Dialog, ErrorBoundary, Toast } from './components/Chrome'
import AddFlow from './components/AddFlow'
import Viewer from './components/Viewer'
import InfoSheet from './components/InfoSheet'
import PhotoEditor from './components/PhotoEditor'
import { ThemeEditorSheet, ThemePickerSheet } from './components/ThemeParts'
import Gallery from './screens/Gallery'
import Themes from './screens/Themes'
import ThemeDetail, { Unsorted } from './screens/ThemeDetail'
import Favorites from './screens/Favorites'
import Search from './screens/Search'
import Trash from './screens/Trash'
import Settings from './screens/Settings'
import { load, useStore } from './lib/store'
import { useRoute } from './lib/nav'
import { useSettings } from './lib/settings'

function useThemeMode() {
  const { themeMode } = useSettings()
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = themeMode === 'dark' || (themeMode === 'system' && mq.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => (m.content = dark ? '#0f0f12' : '#f6f6f8'))
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [themeMode])
}

function Screen({ route }) {
  switch (route.name) {
    case 'themes': return <Themes />
    case 'theme': return <ThemeDetail id={route.id} />
    case 'unsorted': return <Unsorted />
    case 'favorites': return <Favorites />
    case 'search': return <Search />
    case 'trash': return <Trash />
    case 'settings': return <Settings />
    default: return <Gallery />
  }
}

export default function App() {
  const ready = useStore((s) => s.ready)
  const route = useRoute()
  useThemeMode()

  useEffect(() => {
    load().catch((e) => {
      console.error(e)
      alert('Не вдалося відкрити сховище браузера. Можливо, увімкнено приватний режим.')
    })
  }, [])

  // Кожен екран починається згори
  useEffect(() => { window.scrollTo(0, 0) }, [route.name, route.id])

  return (
    <ErrorBoundary>
      <div className="app">
        {ready ? (
          <main className="screen" key={route.name + (route.id || '')}>
            <Screen route={route} />
          </main>
        ) : (
          <div className="splash"><div className="splash-logo" /></div>
        )}
        <BottomNav route={route} />
        <Viewer />
        <InfoSheet />
        <ThemePickerSheet />
        <AddFlow />
        <ThemeEditorSheet />
        <PhotoEditor />
        <Dialog />
        <Toast />
      </div>
    </ErrorBoundary>
  )
}
