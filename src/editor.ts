import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, basicSetup } from 'codemirror';
import { StreamLanguage } from '@codemirror/language';
import { turtle } from '@codemirror/legacy-modes/mode/turtle';
import type { Format } from './options';

const TURTLE_LANGUAGE: Extension = StreamLanguage.define(turtle);

export type PaneEditor = {
  view: EditorView;
  getValue: () => string;
  setValue: (value: string) => void;
  setFormat: (format: Format) => void;
};

function languageFor(format: Format): Extension[] {
  return format === 'turtle' ? [TURTLE_LANGUAGE] : [];
}

export function createEditor(
  parent: HTMLElement,
  initialValue: string,
  initialFormat: Format,
  onChange: (value: string) => void,
): PaneEditor {
  const language = new Compartment();

  const view = new EditorView({
    state: EditorState.create({
      doc: initialValue,
      extensions: [
        basicSetup,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange(update.state.doc.toString());
        }),
        language.of(languageFor(initialFormat)),
      ],
    }),
    parent,
  });

  return {
    view,
    getValue: () => view.state.doc.toString(),
    setValue: (value: string) => {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    },
    setFormat: (format: Format) => {
      view.dispatch({ effects: language.reconfigure(languageFor(format)) });
    },
  };
}
