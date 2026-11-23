<?php

namespace App\Providers;

use App\Support\Storage\DriveClientInterface;
use App\Support\Storage\DriveFolderResolver;
use App\Support\Storage\GoogleDriveClient;
use App\Support\Storage\GoogleDrivePublicImageStore;
use App\Support\Storage\GoogleDriveTokenProvider;
use App\Support\Storage\LocalPublicImageStore;
use App\Support\Storage\PublicImageStore;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(GoogleDriveTokenProvider::class);

        $this->app->singleton(DriveClientInterface::class, function ($app): DriveClientInterface {
            return new GoogleDriveClient($app->make(GoogleDriveTokenProvider::class));
        });

        $this->app->singleton(DriveFolderResolver::class, function ($app): DriveFolderResolver {
            return new DriveFolderResolver($app->make(DriveClientInterface::class));
        });

        $this->app->singleton(PublicImageStore::class, function ($app): PublicImageStore {
            $driver = strtolower(trim((string) config('salo.uploads.public_image_driver', 'local')));

            if ($driver === 'google_drive') {
                return new GoogleDrivePublicImageStore($app->make(GoogleDriveTokenProvider::class));
            }

            return new LocalPublicImageStore;
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
