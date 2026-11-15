<?php

namespace App\Features\Auth\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class EmailOtpMail extends Mailable
{
    use Queueable, SerializesModels;

    public string $purposeLabel;

    public function __construct(
        public string $otpCode,
        public string $purpose,
        public int $expirationMinutes,
    ) {
        $this->purposeLabel = match ($purpose) {
            'restaurant_application' => 'Restaurant Partner Application',
            'rider_application' => 'Rider Partner Application',
            default => 'Email Verification',
        };
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'SALO — Your Verification Code',
        );
    }

    public function content(): Content
    {
        return new Content(
            text: 'emails.auth.email-otp',
        );
    }
}
