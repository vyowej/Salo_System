<?php

namespace App\Support\Storage;

final class ImageProcessor
{
    /**
     * Resize proportionally if needed, apply JPEG EXIF orientation, and re-encode via GD
     * to strip all EXIF/GPS metadata. Returns the temp file path (caller must unlink),
     * or null if GD cannot process the file.
     */
    public static function sanitizeAndOptimize(string $sourcePath, string $mime, int $maxDimension = 1920): ?string
    {
        if (! extension_loaded('gd')) {
            return null;
        }

        $image = match ($mime) {
            'image/jpeg' => @imagecreatefromjpeg($sourcePath),
            'image/png' => @imagecreatefrompng($sourcePath),
            'image/webp' => function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($sourcePath) : false,
            default => false,
        };

        if ($image === false) {
            return null;
        }

        try {
            if ($mime === 'image/jpeg') {
                $image = self::applyExifOrientation($image, $sourcePath);
            }

            $width = imagesx($image);
            $height = imagesy($image);

            if ($width > $maxDimension || $height > $maxDimension) {
                $scale = min($maxDimension / $width, $maxDimension / $height);
                $newW = max(1, (int) round($width * $scale));
                $newH = max(1, (int) round($height * $scale));
                $resized = imagecreatetruecolor($newW, $newH);
                if ($resized !== false) {
                    if ($mime === 'image/png' || $mime === 'image/webp') {
                        imagealphablending($resized, false);
                        imagesavealpha($resized, true);
                        $transparent = imagecolorallocatealpha($resized, 0, 0, 0, 127);
                        if ($transparent !== false) {
                            imagefilledrectangle($resized, 0, 0, $newW, $newH, $transparent);
                        }
                    }
                    imagecopyresampled($resized, $image, 0, 0, 0, 0, $newW, $newH, $width, $height);
                    imagedestroy($image);
                    $image = $resized;
                }
            } elseif ($mime === 'image/png' || $mime === 'image/webp') {
                imagealphablending($image, false);
                imagesavealpha($image, true);
            }

            $tempPath = tempnam(sys_get_temp_dir(), 'salo_img_');
            if ($tempPath === false) {
                return null;
            }

            $written = match ($mime) {
                'image/jpeg' => @imagejpeg($image, $tempPath, 85),
                'image/png' => @imagepng($image, $tempPath, 6),
                'image/webp' => function_exists('imagewebp') ? @imagewebp($image, $tempPath, 85) : false,
                default => false,
            };

            if (! $written) {
                @unlink($tempPath);

                return null;
            }

            return $tempPath;
        } finally {
            imagedestroy($image);
        }
    }

    private static function applyExifOrientation(\GdImage $image, string $sourcePath): \GdImage
    {
        if (! function_exists('exif_read_data')) {
            return $image;
        }

        $exif = @exif_read_data($sourcePath);
        if (! is_array($exif) || empty($exif['Orientation'])) {
            return $image;
        }

        $rotated = match ((int) $exif['Orientation']) {
            3 => imagerotate($image, 180, 0),
            6 => imagerotate($image, -90, 0),
            8 => imagerotate($image, 90, 0),
            default => false,
        };

        if ($rotated instanceof \GdImage) {
            imagedestroy($image);

            return $rotated;
        }

        return $image;
    }
}
