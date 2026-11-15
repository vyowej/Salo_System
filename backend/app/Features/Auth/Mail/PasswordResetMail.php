<?php

namespace App\Features\Auth\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class PasswordResetMail extends Mailable
{
    use Queueable, SerializesModels;

    public string $resetUrl;

    public function __construct(
        public User $user,
        string $plainToken,
        public int $expiryMinutes = 60,
    ) {
        $frontendUrl = rtrim((string) config('app.frontend_url', 'http://localhost:5173'), '/');

        $this->resetUrl = $frontendUrl.'/reset-password?'.http_build_query([
            'token' => $plainToken,
            'email' => $user->email,
        ]);
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'SALO — Reset Your Password',
        );
    }

    public function content(): Content
    {
        return new Content(
            text: 'emails.auth.password-reset',
        );
    }
}
