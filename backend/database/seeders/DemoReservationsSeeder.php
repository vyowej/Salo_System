<?php

namespace Database\Seeders;

use App\Features\Reservations\Support\ReservationStatus;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class DemoReservationsSeeder extends Seeder
{
    public function run(): void
    {
        $dbName = (string) DB::connection()->getDatabaseName();
        if (app()->environment('testing') || strtolower($dbName) === 'salo_test') {
            throw new RuntimeException('Refusing to run DemoReservationsSeeder against testing database (salo_test).');
        }

        $now = CarbonImmutable::now('Asia/Manila');
        $todayStr = $now->format('Ymd');

        $restaurants = DB::table('restaurants')
            ->where(function ($query): void {
                $query->where('accepts_reservations', 1)
                    ->orWhere('offers_dine_in', 1);
            })
            ->orderBy('restaurant_id')
            ->get();

        if ($restaurants->isEmpty()) {
            return;
        }

        $tableCatalog = [
            ['table_name' => 'T-01', 'dining_area' => 'Indoor', 'description' => 'Cozy 2-seater window table', 'seating_capacity' => 2, 'min_party_size' => 1],
            ['table_name' => 'T-02', 'dining_area' => 'Indoor', 'description' => 'Intimate corner booth for two', 'seating_capacity' => 2, 'min_party_size' => 1],
            ['table_name' => 'T-03', 'dining_area' => 'Indoor', 'description' => 'Standard 4-seater dining table', 'seating_capacity' => 4, 'min_party_size' => 2],
            ['table_name' => 'T-04', 'dining_area' => 'Indoor', 'description' => 'Center hall 4-seater table', 'seating_capacity' => 4, 'min_party_size' => 2],
            ['table_name' => 'T-05', 'dining_area' => 'Outdoor', 'description' => 'Al fresco patio table for four', 'seating_capacity' => 4, 'min_party_size' => 2],
            ['table_name' => 'T-06', 'dining_area' => 'Terrace', 'description' => 'Breezy terrace family table for six', 'seating_capacity' => 6, 'min_party_size' => 3],
            ['table_name' => 'T-07', 'dining_area' => 'Terrace', 'description' => 'Large group terrace table for eight', 'seating_capacity' => 8, 'min_party_size' => 4],
            ['table_name' => 'VIP-01', 'dining_area' => 'Private Room', 'description' => 'Private dining room table for ten', 'seating_capacity' => 10, 'min_party_size' => 6],
        ];

        $tablesByRestaurant = [];

        foreach ($restaurants as $index => $restaurant) {
            $restaurantId = (int) $restaurant->restaurant_id;

            // Ensure demo restaurants with dine-in have reservation capability & default policies configured
            DB::table('restaurants')
                ->where('restaurant_id', $restaurantId)
                ->update([
                    'accepts_reservations' => 1,
                    'accepting_reservations' => 1,
                    'reservation_min_notice_hours' => $restaurant->reservation_min_notice_hours ?? 2,
                    'reservation_max_party_size' => max(10, (int) ($restaurant->reservation_max_party_size ?? 10)),
                    'reservation_duration_minutes' => $restaurant->reservation_duration_minutes ?? 90,
                    'reservation_max_advance_days' => $restaurant->reservation_max_advance_days ?? 30,
                    'reservation_cancellation_cutoff_minutes' => $restaurant->reservation_cancellation_cutoff_minutes ?? 120,
                ]);

            // 6 to 8 tables per restaurant
            $sliceCount = ($index % 2 === 0) ? 8 : 6;
            $selectedTables = array_slice($tableCatalog, 0, $sliceCount);
            $tablesByRestaurant[$restaurantId] = [];

            foreach ($selectedTables as $spec) {
                DB::table('restaurant_tables')->updateOrInsert(
                    [
                        'restaurant_id' => $restaurantId,
                        'table_name' => $spec['table_name'],
                    ],
                    [
                        'dining_area' => $spec['dining_area'],
                        'description' => $spec['description'],
                        'seating_capacity' => $spec['seating_capacity'],
                        'min_party_size' => $spec['min_party_size'],
                        'is_active' => 1,
                        'updated_at' => $now,
                        'created_at' => $now,
                    ],
                );

                $tableRow = DB::table('restaurant_tables')
                    ->where('restaurant_id', $restaurantId)
                    ->where('table_name', $spec['table_name'])
                    ->first();

                if ($tableRow) {
                    $tablesByRestaurant[$restaurantId][] = $tableRow;
                }
            }
        }

        $customers = DB::table('users')
            ->where('account_status', 'active')
            ->orderBy('user_id')
            ->get();

        if ($customers->isEmpty()) {
            return;
        }

        $primaryRestaurantId = (int) $restaurants->first()->restaurant_id;
        $secondaryRestaurantId = (int) ($restaurants->skip(1)->first()->restaurant_id ?? $primaryRestaurantId);
        $tertiaryRestaurantId = (int) ($restaurants->skip(2)->first()->restaurant_id ?? $primaryRestaurantId);

        $staffActorId = (int) (
            DB::table('restaurant_owners')->where('restaurant_id', $primaryRestaurantId)->value('user_id')
            ?? $customers->first()->user_id
        );

        $baseDay = $now->startOfDay();

        // 12 sample reservations covering pending, confirmed, seated, completed, cancelled, no_show, rejected, expired
        // across past, today, and future windows.
        $samples = [
            [
                'reference' => "SALO-RES-{$todayStr}-DM01",
                'restaurant_id' => $primaryRestaurantId,
                'table_index' => 2, // T-03 (cap 4)
                'customer_index' => 0,
                'start' => $baseDay->addDays(1)->setTime(18, 0),
                'duration' => 90,
                'guests' => 4,
                'status' => ReservationStatus::PENDING,
                'special_requests' => 'Birthday dinner — window seat preferred if available.',
            ],
            [
                'reference' => "SALO-RES-{$todayStr}-DM02",
                'restaurant_id' => $primaryRestaurantId,
                'table_index' => 5, // T-06 (cap 6)
                'customer_index' => 1,
                'start' => $baseDay->addDays(2)->setTime(19, 0),
                'duration' => 90,
                'guests' => 5,
                'status' => ReservationStatus::PENDING,
                'special_requests' => 'Need 1 high chair for toddler.',
            ],
            [
                'reference' => "SALO-RES-{$todayStr}-DM03",
                'restaurant_id' => $primaryRestaurantId,
                'table_index' => 0, // T-01 (cap 2)
                'customer_index' => 2,
                'start' => $baseDay->setTime(20, 0),
                'duration' => 90,
                'guests' => 2,
                'status' => ReservationStatus::CONFIRMED,
                'special_requests' => 'Anniversary dinner for two.',
                'approved_at' => $now->subHours(3),
                'confirmed_at' => $now->subHours(3),
            ],
            [
                'reference' => "SALO-RES-{$todayStr}-DM04",
                'restaurant_id' => $secondaryRestaurantId,
                'table_index' => 3, // T-04 (cap 4)
                'customer_index' => 0,
                'start' => $baseDay->addDays(3)->setTime(12, 30),
                'duration' => 90,
                'guests' => 3,
                'status' => ReservationStatus::CONFIRMED,
                'special_requests' => 'Team lunch meeting.',
                'approved_at' => $now->subHours(5),
                'confirmed_at' => $now->subHours(5),
            ],
            [
                'reference' => "SALO-RES-{$todayStr}-DM05",
                'restaurant_id' => $primaryRestaurantId,
                'table_index' => 3, // T-04 (cap 4)
                'customer_index' => 3,
                'start' => $baseDay->setTime(12, 0),
                'duration' => 90,
                'guests' => 4,
                'status' => ReservationStatus::SEATED,
                'special_requests' => 'No peanuts / nut allergy at table.',
                'approved_at' => $now->subHours(6),
                'confirmed_at' => $now->subHours(6),
                'arrived_at' => $baseDay->setTime(11, 55),
                'seated_at' => $baseDay->setTime(12, 0),
            ],
            [
                'reference' => "SALO-RES-{$todayStr}-DM06",
                'restaurant_id' => $primaryRestaurantId,
                'table_index' => 4, // T-05 (cap 4)
                'customer_index' => 0,
                'start' => $baseDay->subDays(2)->setTime(18, 30),
                'duration' => 90,
                'guests' => 4,
                'status' => ReservationStatus::COMPLETED,
                'special_requests' => 'Outdoor patio seating.',
                'approved_at' => $baseDay->subDays(3)->setTime(14, 0),
                'confirmed_at' => $baseDay->subDays(3)->setTime(14, 0),
                'arrived_at' => $baseDay->subDays(2)->setTime(18, 25),
                'seated_at' => $baseDay->subDays(2)->setTime(18, 30),
                'completed_at' => $baseDay->subDays(2)->setTime(19, 55),
            ],
            [
                'reference' => "SALO-RES-{$todayStr}-DM07",
                'restaurant_id' => $secondaryRestaurantId,
                'table_index' => 5, // T-06 (cap 6)
                'customer_index' => 1,
                'start' => $baseDay->subDays(4)->setTime(19, 0),
                'duration' => 90,
                'guests' => 6,
                'status' => ReservationStatus::COMPLETED,
                'special_requests' => 'Family dinner celebration.',
                'approved_at' => $baseDay->subDays(5)->setTime(10, 0),
                'confirmed_at' => $baseDay->subDays(5)->setTime(10, 0),
                'arrived_at' => $baseDay->subDays(4)->setTime(18, 50),
                'seated_at' => $baseDay->subDays(4)->setTime(19, 0),
                'completed_at' => $baseDay->subDays(4)->setTime(20, 25),
            ],
            [
                'reference' => "SALO-RES-{$todayStr}-DM08",
                'restaurant_id' => $primaryRestaurantId,
                'table_index' => 1, // T-02 (cap 2)
                'customer_index' => 2,
                'start' => $baseDay->subDays(1)->setTime(13, 0),
                'duration' => 90,
                'guests' => 2,
                'status' => ReservationStatus::CANCELLED,
                'special_requests' => null,
                'cancelled_by' => 'customer',
                'cancelled_at' => $baseDay->subDays(1)->setTime(9, 30),
                'cancellation_reason' => 'Schedule conflict — rescheduling for next week.',
            ],
            [
                'reference' => "SALO-RES-{$todayStr}-DM09",
                'restaurant_id' => $tertiaryRestaurantId,
                'table_index' => 2, // T-03 (cap 4)
                'customer_index' => 3,
                'start' => $baseDay->addDays(4)->setTime(18, 0),
                'duration' => 90,
                'guests' => 3,
                'status' => ReservationStatus::CANCELLED,
                'special_requests' => 'Quiet corner if possible.',
                'cancelled_by' => 'restaurant',
                'cancelled_at' => $now->subHours(2),
                'cancellation_reason' => 'Private event buyout for that evening.',
            ],
            [
                'reference' => "SALO-RES-{$todayStr}-DM10",
                'restaurant_id' => $primaryRestaurantId,
                'table_index' => 0, // T-01 (cap 2)
                'customer_index' => 1,
                'start' => $baseDay->subDays(3)->setTime(19, 30),
                'duration' => 90,
                'guests' => 2,
                'status' => ReservationStatus::NO_SHOW,
                'special_requests' => null,
                'approved_at' => $baseDay->subDays(4)->setTime(15, 0),
                'confirmed_at' => $baseDay->subDays(4)->setTime(15, 0),
                'no_show_marked_at' => $baseDay->subDays(3)->setTime(19, 50),
                'no_show_marked_by' => $staffActorId,
            ],
            [
                'reference' => "SALO-RES-{$todayStr}-DM11",
                'restaurant_id' => $secondaryRestaurantId,
                'table_index' => 1, // T-02 (cap 2)
                'customer_index' => 2,
                'start' => $baseDay->subDays(1)->setTime(20, 0),
                'duration' => 90,
                'guests' => 2,
                'status' => ReservationStatus::REJECTED,
                'special_requests' => 'Late dinner request.',
                'rejection_reason' => 'Kitchen closes early for scheduled maintenance.',
                'rejected_at' => $baseDay->subDays(1)->setTime(15, 0),
            ],
            [
                'reference' => "SALO-RES-{$todayStr}-DM12",
                'restaurant_id' => $tertiaryRestaurantId,
                'table_index' => 0, // T-01 (cap 2)
                'customer_index' => 0,
                'start' => $baseDay->subDays(2)->setTime(12, 0),
                'duration' => 90,
                'guests' => 2,
                'status' => ReservationStatus::EXPIRED,
                'special_requests' => null,
                'expired_at' => $baseDay->subDays(2)->setTime(10, 0),
            ],
        ];

        $customerCount = $customers->count();

        foreach ($samples as $sample) {
            $restaurantId = (int) $sample['restaurant_id'];
            $restaurantTables = $tablesByRestaurant[$restaurantId] ?? [];
            if ($restaurantTables === []) {
                continue;
            }

            $tableObj = $restaurantTables[$sample['table_index'] % count($restaurantTables)];
            $customerObj = $customers[$sample['customer_index'] % $customerCount];

            $start = $sample['start'];
            $end = $start->addMinutes((int) $sample['duration']);

            $contactName = trim(sprintf('%s %s', (string) ($customerObj->first_name ?? 'Demo'), (string) ($customerObj->last_name ?? 'Customer')));
            $contactPhone = isset($customerObj->phone_number) && trim((string) $customerObj->phone_number) !== ''
                ? trim((string) $customerObj->phone_number)
                : '+63 917 555 0199';

            $payload = [
                'customer_id' => (int) $customerObj->user_id,
                'restaurant_id' => $restaurantId,
                'table_id' => (int) $tableObj->table_id,
                'contact_name' => $contactName,
                'contact_phone' => $contactPhone,
                'reservation_start' => $start->format('Y-m-d H:i:s'),
                'reservation_end' => $end->format('Y-m-d H:i:s'),
                'number_of_guests' => (int) $sample['guests'],
                'reservation_status' => $sample['status'],
                'deposit_amount' => '0.00',
                'deposit_status' => 'none',
                'service_fee' => '0.00',
                'is_fee_refundable' => 1,
                'cancellation_fee' => '0.00',
                'special_requests' => $sample['special_requests'],
                'cancelled_by' => $sample['cancelled_by'] ?? null,
                'cancelled_at' => isset($sample['cancelled_at']) ? $sample['cancelled_at']->format('Y-m-d H:i:s') : null,
                'cancellation_reason' => $sample['cancellation_reason'] ?? null,
                'rejection_reason' => $sample['rejection_reason'] ?? null,
                'rejected_at' => isset($sample['rejected_at']) ? $sample['rejected_at']->format('Y-m-d H:i:s') : null,
                'approved_at' => isset($sample['approved_at']) ? $sample['approved_at']->format('Y-m-d H:i:s') : null,
                'confirmed_at' => isset($sample['confirmed_at']) ? $sample['confirmed_at']->format('Y-m-d H:i:s') : null,
                'arrived_at' => isset($sample['arrived_at']) ? $sample['arrived_at']->format('Y-m-d H:i:s') : null,
                'seated_at' => isset($sample['seated_at']) ? $sample['seated_at']->format('Y-m-d H:i:s') : null,
                'completed_at' => isset($sample['completed_at']) ? $sample['completed_at']->format('Y-m-d H:i:s') : null,
                'expired_at' => isset($sample['expired_at']) ? $sample['expired_at']->format('Y-m-d H:i:s') : null,
                'no_show_marked_at' => isset($sample['no_show_marked_at']) ? $sample['no_show_marked_at']->format('Y-m-d H:i:s') : null,
                'no_show_marked_by' => $sample['no_show_marked_by'] ?? null,
                'updated_at' => $now->format('Y-m-d H:i:s'),
                'created_at' => $start->subDay()->format('Y-m-d H:i:s'),
            ];

            DB::table('reservations')->updateOrInsert(
                ['reservation_reference' => $sample['reference']],
                $payload,
            );

            $reservationId = (int) DB::table('reservations')
                ->where('reservation_reference', $sample['reference'])
                ->value('reservation_id');

            if ($reservationId > 0) {
                $hasHistory = DB::table('reservation_status_history')
                    ->where('reservation_id', $reservationId)
                    ->exists();

                if (! $hasHistory) {
                    DB::table('reservation_status_history')->insert([
                        'reservation_id' => $reservationId,
                        'from_status' => null,
                        'to_status' => ReservationStatus::PENDING,
                        'changed_by_user_id' => (int) $customerObj->user_id,
                        'changed_by_role' => 'customer',
                        'note' => 'Reservation submitted by customer.',
                        'created_at' => $start->subDay()->format('Y-m-d H:i:s'),
                    ]);

                    if ($sample['status'] !== ReservationStatus::PENDING) {
                        $actorRole = match ($sample['status']) {
                            ReservationStatus::EXPIRED => 'system',
                            ReservationStatus::CANCELLED => (string) ($sample['cancelled_by'] ?? 'customer'),
                            default => 'restaurant',
                        };

                        $actorUserId = match ($actorRole) {
                            'customer' => (int) $customerObj->user_id,
                            'restaurant' => $staffActorId,
                            default => null,
                        };

                        DB::table('reservation_status_history')->insert([
                            'reservation_id' => $reservationId,
                            'from_status' => ReservationStatus::PENDING,
                            'to_status' => $sample['status'],
                            'changed_by_user_id' => $actorUserId,
                            'changed_by_role' => $actorRole,
                            'note' => $sample['cancellation_reason'] ?? $sample['rejection_reason'] ?? "Transitioned to {$sample['status']}.",
                            'created_at' => $now->format('Y-m-d H:i:s'),
                        ]);
                    }
                }
            }
        }
    }
}
