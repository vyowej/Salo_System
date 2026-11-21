<?php

namespace App\Console\Commands;

use App\Features\Reviews\Services\FeaturedRestaurantService;
use Carbon\Carbon;
use Illuminate\Console\Command;

class SelectFeaturedRestaurantCommand extends Command
{
    protected $signature = 'salo:select-featured-restaurant {--date= : Optional reference date (YYYY-MM-DD) for evaluation}';

    protected $description = 'Run automatic weekly Featured Restaurant of the Week Bayesian selection';

    public function handle(FeaturedRestaurantService $featuredService): int
    {
        $dateOpt = $this->option('date');
        $referenceDate = is_string($dateOpt) && trim($dateOpt) !== ''
            ? Carbon::parse(trim($dateOpt), 'Asia/Manila')
            : null;

        $result = $featuredService->runAutomaticSelection($referenceDate);

        $this->info("[{$result['status']}] {$result['message']}");

        if (! empty($result['featured_week'])) {
            $week = $result['featured_week'];
            $this->line("Featured: {$week['restaurant_name']} ({$week['feature_start_date']} to {$week['feature_end_date']}), Bayesian Score: {$week['bayesian_score']}");
        }

        return self::SUCCESS;
    }
}
