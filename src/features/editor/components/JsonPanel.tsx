'use client';
import { useEffect, useRef, useState } from 'react';
import { useEditor, useEditorState } from '../context';
import type { Ace } from 'ace-builds';
import { t as translateNow } from '@/i18n/core';
import { useT } from '@/i18n/react';

type AceRuntime = {
  edit(element: HTMLElement): Ace.Editor;
  config: { set(key: string, value: string): void };
};
const scripts = new Map<string, Promise<void>>();
function loadScript(src: string) {
  let pending = scripts.get(src);
  if (!pending) {
    pending = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => {
        scripts.delete(src);
        script.remove();
        reject(new Error(translateNow('json.aceUnavailable')));
      };
      document.head.append(script);
    });
    scripts.set(src, pending);
  }
  return pending;
}
export default function JsonPanel() {
  const t = useT();
  const { store } = useEditor();
  const raw = useEditorState((state) => state.rawText);
  const error = useEditorState((state) => state.error);
  const dark = useEditorState((state) => state.workspace.settings.dark);
  const readonly = useEditorState((state) => state.readonly || state.frozen);
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<Ace.Editor | null>(null);
  const silent = useRef(false);
  const [aceReady, setAceReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let instance: Ace.Editor | null = null;
    void loadScript('/vendor/ace.js')
      .then(async () => {
        if (cancelled || !host.current) return;
        await Promise.all(
          [
            '/vendor/mode-json.js',
            '/vendor/theme-chrome.js',
            '/vendor/theme-tomorrow_night.js',
          ].map(loadScript),
        );
        if (cancelled || !host.current) return;
        const runtime = (window as Window & { ace?: AceRuntime }).ace;
        if (!runtime) return;
        runtime.config.set('basePath', '/vendor');
        instance = runtime.edit(host.current);
        editor.current = instance;
        instance.session.setMode('ace/mode/json');
        instance.session.setUseWorker(false);
        instance.setOptions({ fontSize: 12, showPrintMargin: false, tabSize: 2, wrap: true });
        instance.setValue(store.getState().rawText, -1);
        instance.setReadOnly(store.getState().readonly || store.getState().frozen);
        instance.setTheme(
          store.getState().workspace.settings.dark
            ? 'ace/theme/tomorrow_night'
            : 'ace/theme/chrome',
        );
        instance.session.on('change', () => {
          if (!silent.current && instance) store.getState().editJson(instance.getValue());
        });
        setAceReady(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      instance?.destroy();
      editor.current = null;
    };
  }, [store]);
  useEffect(() => {
    if (editor.current && editor.current.getValue() !== raw) {
      silent.current = true;
      const position = editor.current.getCursorPosition();
      editor.current.setValue(raw, -1);
      editor.current.moveCursorToPosition(position);
      silent.current = false;
    }
  }, [raw]);
  useEffect(() => {
    editor.current?.setTheme(dark ? 'ace/theme/tomorrow_night' : 'ace/theme/chrome');
  }, [dark]);
  useEffect(() => {
    editor.current?.setReadOnly(readonly);
  }, [readonly]);
  useEffect(() => {
    editor.current?.session.setAnnotations(
      error ? [{ row: 0, column: 0, text: error, type: 'error' }] : [],
    );
  }, [error]);
  return (
    <div className="json-panel">
      <div
        ref={host}
        className="ace-host"
        aria-label={t('json.editor')}
        style={{ display: aceReady ? 'block' : 'none' }}
      />
      {!aceReady && (
        <textarea
          id="jsonInput"
          aria-label={t('json.editor')}
          spellCheck={false}
          value={raw}
          readOnly={readonly}
          onChange={(event) => store.getState().editJson(event.target.value)}
        />
      )}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <div className="row">
        <button
          onClick={() => {
            try {
              store.setState({ rawText: JSON.stringify(JSON.parse(raw), null, 2) });
            } catch {
              store.setState({ message: t('json.notValidYet') });
            }
          }}
        >
          {t('json.format')}
        </button>
        <span className={error ? 'danger-text' : 'muted'}>
          {error ? t('json.needsFix') : t('json.valid')}
        </span>
      </div>
    </div>
  );
}
