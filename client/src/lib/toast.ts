// Общий тип функции уведомлений для секций админ-панели.
export type ToastFn = (kind: 'success' | 'error', text: string) => void;
