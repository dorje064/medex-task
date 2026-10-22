// jsdom has neither matchMedia nor a working modal <dialog>; these stand-ins
// are just enough for the components under test.

let desktop = true;

/** Choose whether `(min-width: …)` media queries match (desktop) or not (mobile). */
export function setDesktop(value: boolean) {
  desktop = value;
}

export function installBrowserStubs() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (media: string) => ({
      matches: media.includes('min-width') ? desktop : false,
      media,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });

  const dialog = HTMLDialogElement.prototype;
  if (typeof dialog.showModal !== 'function' || !('__stubbed' in dialog)) {
    Object.assign(dialog, {
      __stubbed: true,
      showModal(this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
      close(this: HTMLDialogElement) {
        if (!this.hasAttribute('open')) return;
        this.removeAttribute('open');
        this.dispatchEvent(new Event('close'));
      },
    });
  }
}
