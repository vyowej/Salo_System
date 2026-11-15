SALO — Where Good Food Brings Us Together

Hello {{ $user->first_name }},

We received a request to reset the password for your SALO account ({{ $user->email }}).

Use the link below to set a new password:
{!! $resetUrl !!}

This password reset link will expire in {{ $expiryMinutes }} minutes and can only be used once.

If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.

Thank you,
The SALO Team
