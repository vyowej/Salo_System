<?php

namespace App\Features\Account\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class AccountContactService
{
    public const MAX_CONTACTS = 10;

    /**
     * List saved contact numbers for the user. Seeds from users.phone_number if empty.
     *
     * @return array<int, array<string, mixed>>
     */
    public function list(User $user): array
    {
        $rows = DB::table('user_contact_numbers')
            ->where('user_id', $user->user_id)
            ->orderByDesc('is_default')
            ->orderBy('contact_id')
            ->get();

        if ($rows->isEmpty() && is_string($user->phone_number) && trim($user->phone_number) !== '') {
            $now = now();
            DB::table('user_contact_numbers')->insert([
                'user_id' => $user->user_id,
                'label' => 'Personal',
                'phone_number' => trim($user->phone_number),
                'is_default' => 1,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            $rows = DB::table('user_contact_numbers')
                ->where('user_id', $user->user_id)
                ->orderByDesc('is_default')
                ->orderBy('contact_id')
                ->get();
        }

        return $rows->map(fn (object $row): array => $this->format($row))->all();
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public function create(User $user, array $validated): array
    {
        $count = DB::table('user_contact_numbers')
            ->where('user_id', $user->user_id)
            ->count();

        if ($count >= self::MAX_CONTACTS) {
            throw ValidationException::withMessages([
                'phone_number' => ['You can save up to '.self::MAX_CONTACTS.' contact numbers.'],
            ]);
        }

        $phone = $this->normalizePhone((string) $validated['phone_number']);
        $label = trim((string) ($validated['label'] ?? 'Personal')) ?: 'Personal';
        $wantsDefault = (bool) ($validated['is_default'] ?? false) || $count === 0;

        $contactId = DB::transaction(function () use ($user, $label, $phone, $wantsDefault): int {
            if ($wantsDefault) {
                DB::table('user_contact_numbers')
                    ->where('user_id', $user->user_id)
                    ->update(['is_default' => 0, 'updated_at' => now()]);
            }

            $id = (int) DB::table('user_contact_numbers')->insertGetId([
                'user_id' => $user->user_id,
                'label' => mb_substr($label, 0, 40),
                'phone_number' => $phone,
                'is_default' => $wantsDefault ? 1 : 0,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            if ($wantsDefault) {
                DB::table('users')
                    ->where('user_id', $user->user_id)
                    ->update(['phone_number' => $phone, 'updated_at' => now()]);
            }

            return $id;
        });

        $row = DB::table('user_contact_numbers')->where('contact_id', $contactId)->first();

        return $this->format($row);
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public function update(User $user, int $contactId, array $validated): array
    {
        $existing = $this->requireOwned($user, $contactId);

        $phone = array_key_exists('phone_number', $validated)
            ? $this->normalizePhone((string) $validated['phone_number'])
            : $existing->phone_number;
        $label = array_key_exists('label', $validated)
            ? (trim((string) $validated['label']) ?: $existing->label)
            : $existing->label;
        $wantsDefault = array_key_exists('is_default', $validated)
            ? (bool) $validated['is_default']
            : (bool) $existing->is_default;

        DB::transaction(function () use ($user, $contactId, $label, $phone, $wantsDefault): void {
            if ($wantsDefault) {
                DB::table('user_contact_numbers')
                    ->where('user_id', $user->user_id)
                    ->update(['is_default' => 0, 'updated_at' => now()]);
            }

            DB::table('user_contact_numbers')
                ->where('contact_id', $contactId)
                ->update([
                    'label' => mb_substr($label, 0, 40),
                    'phone_number' => $phone,
                    'is_default' => $wantsDefault ? 1 : 0,
                    'updated_at' => now(),
                ]);

            if ($wantsDefault) {
                DB::table('users')
                    ->where('user_id', $user->user_id)
                    ->update(['phone_number' => $phone, 'updated_at' => now()]);
            }
        });

        $row = DB::table('user_contact_numbers')->where('contact_id', $contactId)->first();

        return $this->format($row);
    }

    /**
     * @return array<string, mixed>
     */
    public function setDefault(User $user, int $contactId): array
    {
        $existing = $this->requireOwned($user, $contactId);

        DB::transaction(function () use ($user, $contactId, $existing): void {
            DB::table('user_contact_numbers')
                ->where('user_id', $user->user_id)
                ->update(['is_default' => 0, 'updated_at' => now()]);

            DB::table('user_contact_numbers')
                ->where('contact_id', $contactId)
                ->update(['is_default' => 1, 'updated_at' => now()]);

            DB::table('users')
                ->where('user_id', $user->user_id)
                ->update(['phone_number' => $existing->phone_number, 'updated_at' => now()]);
        });

        $row = DB::table('user_contact_numbers')->where('contact_id', $contactId)->first();

        return $this->format($row);
    }

    public function delete(User $user, int $contactId): void
    {
        $existing = $this->requireOwned($user, $contactId);

        DB::transaction(function () use ($user, $contactId, $existing): void {
            DB::table('user_contact_numbers')->where('contact_id', $contactId)->delete();

            if ((bool) $existing->is_default) {
                $next = DB::table('user_contact_numbers')
                    ->where('user_id', $user->user_id)
                    ->orderBy('contact_id')
                    ->first();

                if ($next !== null) {
                    DB::table('user_contact_numbers')
                        ->where('contact_id', $next->contact_id)
                        ->update(['is_default' => 1, 'updated_at' => now()]);
                    DB::table('users')
                        ->where('user_id', $user->user_id)
                        ->update(['phone_number' => $next->phone_number, 'updated_at' => now()]);
                }
            }
        });
    }

    private function requireOwned(User $user, int $contactId): object
    {
        $row = DB::table('user_contact_numbers')
            ->where('contact_id', $contactId)
            ->where('user_id', $user->user_id)
            ->first();

        if ($row === null) {
            throw new NotFoundHttpException('Contact number not found.');
        }

        return $row;
    }

    private function normalizePhone(string $raw): string
    {
        $cleaned = preg_replace('/[\s\-().]+/', '', trim($raw)) ?? '';
        if (str_starts_with($cleaned, '+63') && strlen($cleaned) === 13) {
            return '0'.substr($cleaned, 3);
        }

        return $cleaned;
    }

    /**
     * @return array<string, mixed>
     */
    private function format(object $row): array
    {
        return [
            'id' => (int) $row->contact_id,
            'contact_id' => (int) $row->contact_id,
            'label' => $row->label,
            'phone_number' => $row->phone_number,
            'is_default' => (bool) $row->is_default,
            'created_at' => $row->created_at,
        ];
    }
}
