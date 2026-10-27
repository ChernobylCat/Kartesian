// @vitest-environment jsdom
import { afterEach, beforeAll, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import Dialog from '@/components/ui/Dialog';
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(cleanup);
describe('accessible dialog', () => {
  it('assigns an independent accessible title to each instance', () => {
    render(
      <>
        <Dialog title="Bantuan" onClose={() => {}}>
          Shortcut
        </Dialog>
        <Dialog title="Panduan" onClose={() => {}}>
          Langkah awal
        </Dialog>
      </>,
    );
    const dialogs = screen.getAllByRole('dialog');
    const ids = dialogs.map((dialog) => dialog.getAttribute('aria-labelledby'));
    expect(new Set(ids).size).toBe(2);
    expect(ids.map((id) => document.getElementById(id!)?.textContent)).toEqual([
      'Bantuan',
      'Panduan',
    ]);
  });
  it('names the dialog and handles explicit close', () => {
    const close = vi.fn();
    render(
      <Dialog title="Tinjau kandidat" onClose={close}>
        <p>Daftar field</p>
      </Dialog>,
    );
    expect(screen.getByRole('dialog', { name: 'Tinjau kandidat' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tutup dialog' }));
    expect(close).toHaveBeenCalledOnce();
  });
});
