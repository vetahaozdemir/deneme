declare global {
  interface Window {
    pdfjsLib: {
      getDocument: (url: string) => {
        promise: Promise<any>;
      };
    };
    ePub: (url: string) => any;
  }
}

export {};