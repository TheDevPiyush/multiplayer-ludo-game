'use client';

import { useState, type FormEvent } from 'react';

const TOPICS = ['Bug report', 'Feedback or idea', 'Account help', 'Privacy request', 'Something else'];

/** No backend: builds a mailto: link, so messages land in the support inbox like any other email. */
export function ContactForm({ email }: { email: string }) {
    const [topic, setTopic] = useState(TOPICS[0]!);
    const [username, setUsername] = useState('');
    const [message, setMessage] = useState('');

    function submit(e: FormEvent) {
        e.preventDefault();
        const body = `${message.trim()}\n\n—\nUsername: ${username.trim() || 'n/a'}`;
        const subject = `[Simple Ludo] ${topic}`;
        window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    }

    return (
        <form className="form" onSubmit={submit}>
            <label>
                Topic
                <select value={topic} onChange={e => setTopic(e.target.value)}>
                    {TOPICS.map(t => (
                        <option key={t}>{t}</option>
                    ))}
                </select>
            </label>
            <label>
                Username (optional)
                <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Shown on your Profile tab" maxLength={40} />
            </label>
            <label>
                Message
                <textarea value={message} onChange={e => setMessage(e.target.value)} required maxLength={4000} placeholder="Tell us what happened…" />
            </label>
            <button className="btn btn-primary" type="submit">
                Write email
            </button>
        </form>
    );
}
