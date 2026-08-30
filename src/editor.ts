import { Compartment, EditorState, StateEffect, StateField, type Extension } from '@codemirror/state';
import { EditorView, basicSetup } from 'codemirror';
import { Decoration, type DecorationSet } from '@codemirror/view';
import { StreamLanguage } from '@codemirror/language';
import { turtle } from '@codemirror/legacy-modes/mode/turtle';
import type { Format } from './options';

const TURTLE_LANGUAGE: Extension = StreamLanguage.define(turtle);

// Locate-highlight: a single temporary mark set from outside (clicking a
// result card), cleared on any edit.
const setLocateHighlight = StateEffect.define<{ from: number; to: number } | null>();
const locateMark = Decoration.mark({ class: 'cm-locate-highlight' });
const locateField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    if (tr.docChanged) return Decoration.none;
    for (const effect of tr.effects) {
      if (effect.is(setLocateHighlight)) {
        deco = effect.value
          ? Decoration.set([locateMark.range(effect.value.from, effect.value.to)])
          : Decoration.none;
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export type PaneEditor = {
  view: EditorView;
  getValue: () => string;
  setValue: (value: string) => void;
  setFormat: (format: Format) => void;
  // Highlights and scrolls to the first occurrence of any of the given
  // strings; returns whether one was found.
  locate: (terms: string[]) => boolean;
};

// Characters that can continue a Turtle prefixed name; a real occurrence of
// ex:Bob must not sit inside ex:Bobby or aex:Bob. Deliberately excludes '.'
// so a statement-terminating dot (ex:Alice.) does not disqualify a match.
const NAME_CHAR = /[A-Za-z0-9_-]/;

function findWithBoundaries(text: string, term: string): number {
  for (let from = text.indexOf(term); from >= 0; from = text.indexOf(term, from + 1)) {
    const before = from === 0 ? '' : text[from - 1];
    const after = from + term.length >= text.length ? '' : text[from + term.length];
    if (!NAME_CHAR.test(before) && !NAME_CHAR.test(after)) return from;
  }
  return -1;
}

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
        locateField,
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
    locate: (terms: string[]) => {
      const text = view.state.doc.toString();
      for (const term of terms) {
        const from = findWithBoundaries(text, term);
        if (from < 0) continue;
        const to = from + term.length;
        view.dispatch({
          effects: [
            setLocateHighlight.of({ from, to }),
            EditorView.scrollIntoView(from, { y: 'center' }),
          ],
        });
        return true;
      }
      view.dispatch({ effects: setLocateHighlight.of(null) });
      return false;
    },
  };
}
