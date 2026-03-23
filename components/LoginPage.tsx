import React from 'react';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import { useAuth } from './AuthContext';

function decodeJwt(token: string): any {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
            atob(base64).split('').map(c =>
                '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
            ).join('')
        );
        return JSON.parse(jsonPayload);
    } catch {
        return null;
    }
}

export const LoginPage: React.FC = () => {
    const { login } = useAuth();

    const handleSuccess = (response: CredentialResponse) => {
        if (!response.credential) return;
        const payload = decodeJwt(response.credential);
        if (!payload) return;
        login({ name: payload.name, email: payload.email, picture: payload.picture, sub: payload.sub });
    };

    return (
        <div style={{
            minHeight: '100dvh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 40%, #312e81 100%)',
            fontFamily: "'Inter', system-ui, sans-serif",
            position: 'relative',
            overflow: 'hidden',
        }}>
            {/* Subtle background glow */}
            <div style={{
                position: 'absolute', top: '-10%', left: '20%',
                width: '500px', height: '500px',
                background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)',
                borderRadius: '50%',
                animation: 'float 8s ease-in-out infinite',
            }} />

            {/* Login card */}
            <div style={{
                position: 'relative',
                background: 'rgba(255,255,255,0.05)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '24px',
                padding: '48px 40px',
                width: '100%',
                maxWidth: '380px',
                margin: '16px',
                boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
                textAlign: 'center',
            }}>
                {/* Logo */}
                <div style={{
                    width: '60px', height: '60px',
                    background: 'linear-gradient(135deg, #6366f1, #10b981)',
                    borderRadius: '18px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 20px',
                    boxShadow: '0 8px 24px rgba(99,102,241,0.4)',
                }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        {/* Globe */}
                        <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" fill="none"/>
                        <path d="M3 12h18M12 3c-2.5 3-4 5.5-4 9s1.5 6 4 9M12 3c2.5 3 4 5.5 4 9s-1.5 6-4 9" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" fill="none"/>
                        {/* Location pin overlay */}
                        <circle cx="12" cy="10" r="2.5" fill="white"/>
                        <path d="M12 10 L12 15" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                </div>

                <h1 style={{ color: '#ffffff', fontSize: '22px', fontWeight: 700, marginBottom: '6px', letterSpacing: '-0.5px' }}>
                    Geo-Intel Dashboard
                </h1>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', marginBottom: '36px', lineHeight: '1.5' }}>
                    Site intelligence platform for multi-domain location analysis.
                </p>

                {/* Divider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
                    <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px' }}>Sign in to continue</span>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <GoogleLogin
                        onSuccess={handleSuccess}
                        onError={() => console.error('Google Sign-In failed')}
                        theme="filled_black"
                        size="large"
                        shape="rectangular"
                        text="signin_with"
                        logo_alignment="left"
                    />
                </div>

                <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '11px', marginTop: '24px' }}>
                    Access is restricted to authorised users only.
                </p>
            </div>

            <style>{`
                @keyframes float {
                    0%, 100% { transform: translateY(0px); }
                    50% { transform: translateY(-20px); }
                }
            `}</style>
        </div>
    );
};
