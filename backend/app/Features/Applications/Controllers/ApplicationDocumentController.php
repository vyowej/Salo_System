<?php

namespace App\Features\Applications\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\AuditLogService;
use App\Support\FileStorageService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

class ApplicationDocumentController extends Controller
{
    public function __construct(
        private readonly FileStorageService $fileStorageService,
        private readonly AuditLogService $auditLogService,
    ) {}

    public function show(Request $request, int $documentId): Response
    {
        /** @var User $user */
        $user = $request->user();

        $doc = DB::table('application_documents')->where('document_id', $documentId)->first();
        abort_unless($doc !== null, 404, 'Document not found.');

        $authorized = $user->user_role === 'admin' || (int) $doc->uploaded_by === (int) $user->user_id;

        if (! $authorized && $doc->rider_application_id !== null) {
            $ownerId = DB::table('rider_applications')
                ->where('rider_application_id', $doc->rider_application_id)
                ->value('applicant_user_id');
            $authorized = (int) $ownerId === (int) $user->user_id;
        }

        if (! $authorized && $doc->restaurant_application_id !== null) {
            $app = DB::table('restaurant_applications')
                ->where('restaurant_application_id', $doc->restaurant_application_id)
                ->first(['applicant_user_id', 'restaurant_id']);

            if ($app) {
                $authorized = (int) $app->applicant_user_id === (int) $user->user_id
                    || DB::table('restaurant_owners')
                        ->where('restaurant_id', $app->restaurant_id)
                        ->where('user_id', $user->user_id)
                        ->exists();
            }
        }

        if (! $authorized) {
            $this->auditLogService->recordPrivateFileAccess((int) $user->user_id, 'application_documents', $documentId, false, $request);
            abort(403, 'Forbidden: you do not have access to this document.');
        }

        $this->auditLogService->recordPrivateFileAccess((int) $user->user_id, 'application_documents', $documentId, true, $request);

        return $this->fileStorageService->streamPrivateStoredFile(
            path: $doc->file_path,
            downloadName: $doc->original_filename,
            mimeType: $doc->mime_type,
            thumbnail: $request->query('variant') === 'thumb',
            request: $request,
        );
    }
}
