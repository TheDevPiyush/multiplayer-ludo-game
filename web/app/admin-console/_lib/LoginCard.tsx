'use client';

import { ArrowLeft, Dice5, Loader2, Mail } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAdmin } from './admin-context';

/** Supabase email OTP: send a code, then enter it. Only existing accounts can sign in. */
export function LoginCard() {
    const { supabase } = useAdmin();
    const [step, setStep] = useState<'email' | 'code'>('email');
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const sendCode = async (e?: FormEvent) => {
        e?.preventDefault();
        if (!supabase) return;
        setBusy(true);
        setError(null);
        const { error } = await supabase.auth.signInWithOtp({
            email: email.trim(),
            // The console never creates accounts.
            options: { shouldCreateUser: false },
        });
        setBusy(false);
        if (error) return setError(error.message);
        setStep('code');
    };

    const verify = async (e: FormEvent) => {
        e.preventDefault();
        if (!supabase) return;
        setBusy(true);
        setError(null);
        const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
        setBusy(false);
        if (error) setError(error.message);
    };

    return (
        <Card className="w-full max-w-sm shadow-lg">
            <CardHeader>
                <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[oklch(0.45_0.22_300)] text-primary-foreground shadow-sm">
                    <Dice5 className="size-6" />
                </div>
                <CardTitle className="text-lg">Simple Ludo admin</CardTitle>
                <CardDescription>
                    {step === 'email' ? 'Sign in with your admin email. We’ll send you a one-time code.' : `Enter the code sent to ${email}.`}
                </CardDescription>
            </CardHeader>
            <CardContent>
                {step === 'email' ? (
                    <form onSubmit={sendCode} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" type="email" autoComplete="email" required autoFocus value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
                        </div>
                        {error && <p className="text-sm text-destructive">{error}</p>}
                        <Button type="submit" disabled={busy || !email.trim()}>
                            {busy ? <Loader2 className="animate-spin" /> : <Mail />} Send code
                        </Button>
                    </form>
                ) : (
                    <form onSubmit={verify} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="code">Code</Label>
                            <Input
                                id="code"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                required
                                autoFocus
                                maxLength={10}
                                value={code}
                                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                                placeholder="123456"
                                className="tracking-[0.3em]"
                            />
                        </div>
                        {error && <p className="text-sm text-destructive">{error}</p>}
                        <Button type="submit" disabled={busy || code.length < 6}>
                            {busy && <Loader2 className="animate-spin" />} Verify and sign in
                        </Button>
                        <div className="flex justify-between">
                            <Button type="button" variant="ghost" size="sm" onClick={() => { setStep('email'); setCode(''); setError(null); }}>
                                <ArrowLeft /> Change email
                            </Button>
                            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void sendCode()}>Resend code</Button>
                        </div>
                    </form>
                )}
            </CardContent>
        </Card>
    );
}
