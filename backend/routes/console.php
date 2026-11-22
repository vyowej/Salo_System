<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Idempotent automatic weekly Featured Restaurant of the Week selection.
Schedule::command('salo:select-featured-restaurant')
    ->dailyAt('00:05')
    ->timezone('Asia/Manila')
    ->withoutOverlapping();

// Expire stale pending/awaiting_payment reservations and warn handlers before expiry.
Schedule::command('salo:expire-stale-reservations')
    ->everyFiveMinutes()
    ->timezone('Asia/Manila')
    ->withoutOverlapping(10);

// Send upcoming table reservation reminders to customers.
Schedule::command('salo:send-reservation-reminders')
    ->everyFiveMinutes()
    ->timezone('Asia/Manila')
    ->withoutOverlapping(10);
