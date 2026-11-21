<?php

namespace App\Features\Locations\Services;

use App\Models\User;
use App\Support\AddressService;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CustomerAddressService
{
    private const MAX_ADDRESSES = 10;

    public function __construct(
        private readonly AddressService $addressService,
        private readonly ServiceAreaValidationService $serviceAreaValidation,
    ) {}

    /**
     * @return list<array<string, mixed>>
     */
    public function listForUser(User $user): array
    {
        $rows = DB::table('user_addresses as ua')
            ->join('addresses as a', 'a.address_id', '=', 'ua.address_id')
            ->join('barangays as b', 'b.barangay_id', '=', 'a.barangay_id')
            ->join('cities as c', 'c.city_id', '=', 'b.city_id')
            ->join('provinces as p', 'p.province_id', '=', 'c.province_id')
            ->where('ua.user_id', $user->user_id)
            ->orderByDesc('ua.is_default')
            ->orderByDesc('ua.created_at')
            ->select([
                'ua.user_address_id',
                'ua.address_id',
                'ua.address_label',
                'ua.is_default',
                'a.street',
                'a.house_number',
                'a.building_name',
                'a.landmark',
                'a.postal_code',
                'a.latitude',
                'a.longitude',
                'a.gps_accuracy',
                'b.barangay_name',
                'c.city_name',
                'p.province_name',
            ])
            ->get();

        if ($rows->isEmpty()) {
            return [];
        }

        $activeAreas = $this->serviceAreaValidation->loadActiveAreasForProvinces(
            $rows->pluck('province_name')->map(static fn ($name): string => (string) $name)->all()
        );

        return $rows->map(fn (object $row): array => $this->formatAddressRow($row, $activeAreas))->all();
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function createForUser(User $user, array $data): array
    {
        $count = DB::table('user_addresses')->where('user_id', $user->user_id)->count();
        if ($count >= self::MAX_ADDRESSES) {
            throw ValidationException::withMessages([
                'address' => ['Address limit reached (maximum 10 saved addresses).'],
            ]);
        }

        $isFirst = $count === 0;
        $shouldBeDefault = ! empty($data['is_default']) || $isFirst;

        $userAddressId = DB::transaction(function () use ($user, $data, $shouldBeDefault): int {
            if ($shouldBeDefault) {
                DB::table('user_addresses')
                    ->where('user_id', $user->user_id)
                    ->where('is_default', 1)
                    ->update(['is_default' => 0, 'updated_at' => now()]);
            }

            $addressId = $this->addressService->createAddress([
                'province' => $data['province'],
                'city' => $data['city'],
                'barangay' => $data['barangay'],
                'street' => $data['street'] ?? null,
                'house_number' => $data['house_number'] ?? null,
                'building_name' => $data['building_name'] ?? null,
                'landmark' => $data['landmark'] ?? $data['notes'] ?? null,
                'postal_code' => $data['postal_code'] ?? null,
                'latitude' => $data['latitude'] ?? null,
                'longitude' => $data['longitude'] ?? null,
                'gps_accuracy' => $data['gps_accuracy'] ?? null,
            ]);

            return (int) DB::table('user_addresses')->insertGetId([
                'user_id' => $user->user_id,
                'address_id' => $addressId,
                'address_label' => mb_substr(trim((string) ($data['label'] ?? 'Home')), 0, 50),
                'is_default' => $shouldBeDefault ? 1 : 0,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        });

        return $this->findForUser($user, $userAddressId);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function updateForUser(User $user, int $userAddressId, array $data): array
    {
        $existing = DB::table('user_addresses')
            ->where('user_address_id', $userAddressId)
            ->where('user_id', $user->user_id)
            ->first();

        if (! $existing) {
            abort(404, 'Saved address not found.');
        }

        DB::transaction(function () use ($user, $existing, $userAddressId, $data): void {
            $shouldBeDefault = array_key_exists('is_default', $data)
                ? (bool) $data['is_default']
                : (bool) $existing->is_default;

            if ($shouldBeDefault && ! $existing->is_default) {
                DB::table('user_addresses')
                    ->where('user_id', $user->user_id)
                    ->where('is_default', 1)
                    ->update(['is_default' => 0, 'updated_at' => now()]);
            }

            $this->addressService->updateAddress((int) $existing->address_id, [
                'province' => $data['province'] ?? null,
                'city' => $data['city'] ?? null,
                'barangay' => $data['barangay'] ?? null,
                'street' => $data['street'] ?? null,
                'house_number' => $data['house_number'] ?? null,
                'building_name' => $data['building_name'] ?? null,
                'landmark' => $data['landmark'] ?? $data['notes'] ?? null,
                'postal_code' => $data['postal_code'] ?? null,
                'latitude' => $data['latitude'] ?? null,
                'longitude' => $data['longitude'] ?? null,
                'gps_accuracy' => $data['gps_accuracy'] ?? null,
            ]);

            DB::table('user_addresses')
                ->where('user_address_id', $userAddressId)
                ->update([
                    'address_label' => array_key_exists('label', $data)
                        ? mb_substr(trim((string) $data['label']), 0, 50)
                        : $existing->address_label,
                    'is_default' => $shouldBeDefault ? 1 : 0,
                    'updated_at' => now(),
                ]);
        });

        return $this->findForUser($user, $userAddressId);
    }

    public function setDefaultForUser(User $user, int $userAddressId): array
    {
        $existing = DB::table('user_addresses')
            ->where('user_address_id', $userAddressId)
            ->where('user_id', $user->user_id)
            ->first();

        if (! $existing) {
            abort(404, 'Saved address not found.');
        }

        DB::transaction(function () use ($user, $userAddressId): void {
            DB::table('user_addresses')
                ->where('user_id', $user->user_id)
                ->where('is_default', 1)
                ->update(['is_default' => 0, 'updated_at' => now()]);

            DB::table('user_addresses')
                ->where('user_address_id', $userAddressId)
                ->update(['is_default' => 1, 'updated_at' => now()]);
        });

        return $this->listForUser($user);
    }

    public function deleteForUser(User $user, int $userAddressId): array
    {
        $existing = DB::table('user_addresses')
            ->where('user_address_id', $userAddressId)
            ->where('user_id', $user->user_id)
            ->first();

        if (! $existing) {
            abort(404, 'Saved address not found.');
        }

        DB::transaction(function () use ($user, $existing, $userAddressId): void {
            DB::table('user_addresses')->where('user_address_id', $userAddressId)->delete();

            if ((int) $existing->is_default === 1) {
                $nextId = DB::table('user_addresses')
                    ->where('user_id', $user->user_id)
                    ->orderBy('created_at')
                    ->value('user_address_id');

                if ($nextId) {
                    DB::table('user_addresses')
                        ->where('user_address_id', $nextId)
                        ->update(['is_default' => 1, 'updated_at' => now()]);
                }
            }
        });

        return $this->listForUser($user);
    }

    private function findForUser(User $user, int $userAddressId): array
    {
        $row = DB::table('user_addresses as ua')
            ->join('addresses as a', 'a.address_id', '=', 'ua.address_id')
            ->join('barangays as b', 'b.barangay_id', '=', 'a.barangay_id')
            ->join('cities as c', 'c.city_id', '=', 'b.city_id')
            ->join('provinces as p', 'p.province_id', '=', 'c.province_id')
            ->where('ua.user_id', $user->user_id)
            ->where('ua.user_address_id', $userAddressId)
            ->select([
                'ua.user_address_id',
                'ua.address_id',
                'ua.address_label',
                'ua.is_default',
                'a.street',
                'a.house_number',
                'a.building_name',
                'a.landmark',
                'a.postal_code',
                'a.latitude',
                'a.longitude',
                'a.gps_accuracy',
                'b.barangay_name',
                'c.city_name',
                'p.province_name',
            ])
            ->first();

        if (! $row) {
            abort(404, 'Saved address not found.');
        }

        return $this->formatAddressRow($row);
    }

    private function formatAddressRow(object $row, ?iterable $preloadedActiveAreas = null): array
    {
        $support = $this->serviceAreaValidation->checkPlatformSupport(
            (string) $row->province_name,
            (string) $row->city_name,
            (string) $row->barangay_name,
            $preloadedActiveAreas,
        );

        return [
            'id' => (int) $row->user_address_id,
            'address_id' => (int) $row->address_id,
            'country' => 'Philippines',
            'label' => $row->address_label,
            'is_default' => (bool) $row->is_default,
            'province' => $row->province_name,
            'city' => $row->city_name,
            'barangay' => $row->barangay_name,
            'street' => $row->street ?? '',
            'house_number' => $row->house_number ?? '',
            'building_name' => $row->building_name ?? '',
            'landmark' => $row->landmark ?? '',
            'postal_code' => $row->postal_code ?? '',
            'latitude' => $row->latitude !== null ? (float) $row->latitude : null,
            'longitude' => $row->longitude !== null ? (float) $row->longitude : null,
            'gps_accuracy' => $row->gps_accuracy !== null ? (float) $row->gps_accuracy : null,
            'is_service_area_supported' => $support['supported'],
            'service_area_message' => $support['reason'],
        ];
    }
}
