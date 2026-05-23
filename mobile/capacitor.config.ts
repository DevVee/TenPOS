import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.tenpos.app',
  appName: 'TenPOS',
  webDir: 'dist',
  // Production: serve bundled assets, no remote URL
  server: {
    androidScheme: 'https',
    // DO NOT set 'url' here — that enables live-reload, which breaks production APKs
  },
  plugins: {
    // Native battery-efficient network monitoring
    Network: {},
    // Back-button handling, foreground/background lifecycle
    App: {},
    // Status bar handling for Android
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#111318',
    },
    // Splash screen — keep brief
    SplashScreen: {
      launchShowDuration: 1000,
      backgroundColor: '#111318',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
  },
  android: {
    allowMixedContent: false,        // no http:// resources from https context
    captureInput: true,              // improves keyboard handling in WebView
    webContentsDebuggingEnabled: false, // MUST be false for production builds
    loggingBehavior: 'none',         // suppress verbose bridge logs in release
    backgroundColor: '#111318',      // matches splash + app background
  },
}

export default config
