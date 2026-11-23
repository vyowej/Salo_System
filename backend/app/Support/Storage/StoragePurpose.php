<?php

namespace App\Support\Storage;

final class StoragePurpose
{
    public const RESTAURANT_LOGO = 'restaurant_logo';

    public const RESTAURANT_COVER = 'restaurant_cover';

    public const MENU_ITEM_PHOTO = 'menu_item_photo';

    public const APPLICATION_DOCUMENT = 'application_document';

    public const BRANCH_PERMIT = 'branch_permit';

    public const DELIVERY_CONFIRMATION = 'delivery_confirmation';

    public const SUPPORT_ATTACHMENT = 'support_attachment';

    public const PROFILE_CHANGE_DOCUMENT = 'profile_change_document';

    public const VISIBILITY_PUBLIC = 'public';

    public const VISIBILITY_PRIVATE = 'private';

    public static function isPublic(string $purpose): bool
    {
        return in_array($purpose, [
            self::RESTAURANT_LOGO,
            self::RESTAURANT_COVER,
            self::MENU_ITEM_PHOTO,
        ], true);
    }

    public static function visibility(string $purpose): string
    {
        return self::isPublic($purpose) ? self::VISIBILITY_PUBLIC : self::VISIBILITY_PRIVATE;
    }
}
