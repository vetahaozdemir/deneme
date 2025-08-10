import { toast, ToastOptions } from 'react-toastify';

export const useNotify = () => {
  const notifySuccess = (message: string, options?: ToastOptions) =>
    toast.success(message, options);
  const notifyWarning = (message: string, options?: ToastOptions) =>
    toast.warn(message, options);
  const notifyError = (message: string, options?: ToastOptions) =>
    toast.error(message, options);

  return { notifySuccess, notifyWarning, notifyError };
};
