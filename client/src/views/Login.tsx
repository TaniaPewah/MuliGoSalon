import { useState, type FormEvent } from 'react';
import { CHARACTERS, type Character } from '@multigo/shared';
import { Avatar, CHARACTER_META } from '../components/Avatar';
import { useStore } from '../store';

export function LoginView() {
  const { actions, connected } = useStore();
  const [name, setName] = useState(() => localStorage.getItem('multigo:name') ?? '');
  const [character, setCharacter] = useState<Character>(
    () => (localStorage.getItem('multigo:character') as Character | null) ?? 'sloth',
  );
  const [submitting, setSubmitting] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    localStorage.setItem('multigo:name', trimmed);
    localStorage.setItem('multigo:character', character);
    setSubmitting(true);
    actions.join(trimmed, character);
  };

  return (
    <main className="login">
      <div className="login__card">
        <header className="login__header">
          <h1 className="brand">
            multi<span>GO</span>
          </h1>
          <p className="login__tagline">A cosy little Go salon. Pick a friend, pull up a chair, play a game.</p>
        </header>

        <form onSubmit={submit} className="login__form">
          <label className="field">
            <span className="field__label">Your name</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Hikaru"
              maxLength={16}
              autoFocus
              required
              data-testid="name-input"
            />
          </label>

          <fieldset className="characters">
            <legend className="field__label">Choose your character</legend>
            <div className="characters__grid">
              {CHARACTERS.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={['character', character === c ? 'character--selected' : ''].join(' ')}
                  style={{ background: CHARACTER_META[c].color }}
                  onClick={() => setCharacter(c)}
                  aria-pressed={character === c}
                  data-testid={`character-${c}`}
                >
                  <Avatar character={c} size={84} />
                  <strong>{CHARACTER_META[c].label}</strong>
                  <small>{CHARACTER_META[c].blurb}</small>
                </button>
              ))}
            </div>
          </fieldset>

          <button type="submit" className="btn btn--primary btn--large" disabled={submitting && !connected} data-testid="join-button">
            {submitting && !connected ? 'Connecting…' : 'Enter the salon'}
          </button>
        </form>
      </div>
    </main>
  );
}
