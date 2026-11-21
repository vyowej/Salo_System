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
