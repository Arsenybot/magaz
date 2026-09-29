/**
 * Telegram WebApp Integration helper
 */

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        initDataUnsafe?: {
          user?: {
            id: number;
            first_name: string;
            last_name?: string;
            username?: string;
            language_code?: string;
          };
          query_id?: string;
        };
        colorScheme?: 'light' | 'dark';
        themeParams?: Record<string, string>;
        isExpanded?: boolean;
        viewportHeight?: number;
        viewportStableHeight?: number;
        headerColor?: string;
        backgroundColor?: string;
        BackButton?: {
          isVisible: boolean;
          show: () => void;
          hide: () => void;
          onClick: (cb: () => void) => void;
          offClick: (cb: () => void) => void;
        };
        MainButton?: {
          text: string;
          color: string;
          textColor: string;
          isVisible: boolean;
          isActive: boolean;
          isProgressVisible: boolean;
          show: () => void;
          hide: () => void;
          enable: () => void;
          disable: () => void;
          showProgress: (leaveActive?: boolean) => void;
          hideProgress: () => void;
          setText: (text: string) => void;
          onClick: (cb: () => void) => void;
          offClick: (cb: () => void) => void;
        };
        HapticFeedback?: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
          notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
          selectionChanged: () => void;
        };
        expand: () => void;
        close: () => void;
        ready: () => void;
      };
    };
  }
}

export function initTelegramApp() {
  const tg = window.Telegram?.WebApp;
  if (tg) {
    try {
      tg.ready();
      tg.expand();
    } catch {
      // ignore
    }
  }
}

export function triggerHaptic(style: 'light' | 'medium' | 'heavy' = 'light') {
  window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
}

export function triggerHapticSuccess() {
  window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
}

export function getTelegramInitData(): string {
  return window.Telegram?.WebApp?.initData || '';
}

export function getTelegramUser() {
  return window.Telegram?.WebApp?.initDataUnsafe?.user;
}
