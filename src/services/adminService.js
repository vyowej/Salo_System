import { getAdminMock, getPlatformTotals, getOrdersWithFinancials } from '../features/admin/mocks';

const STORAGE_KEYS = {
  restaurants: 'salo_admin_restaurants',
  riders: 'salo_admin_riders',
  users: 'salo_admin_users',
  config: 'salo_admin_config',
};

function read(topic, key) {
  const fallback = getAdminMock(topic).data;
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

export const adminService = {
  getPlatformStats() {
    return getAdminMock('dashboard').data;
  },

  getFinancialTotals() {
    return getPlatformTotals();
  },

  getRestaurants() {
    return read('restaurants', STORAGE_KEYS.restaurants);
  },

  saveRestaurants(restaurants) {
    write(STORAGE_KEYS.restaurants, restaurants);
    return restaurants;
  },

  updateRestaurantStatus(id, status, details = {}) {
    const updated = this.getRestaurants().map((restaurant) => {
      if (restaurant.id === id || restaurant.referenceNumber === id) {
        return { ...restaurant, ...details, status };
      }
      return restaurant;
    });
    write(STORAGE_KEYS.restaurants, updated);

    // Sync to partner applications if matching
    try {
      const partnerAppsKey = 'salo_partner_applications';
      const stored = localStorage.getItem(partnerAppsKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.restaurant && (parsed.restaurant.id === id || parsed.restaurant.referenceNumber === id)) {
          parsed.restaurant = {
            ...parsed.restaurant,
            ...details,
            status,
            applicationStatus: details.applicationStatus || status,
          };
          localStorage.setItem(partnerAppsKey, JSON.stringify(parsed));
        }
      }
    } catch {
      // ignore
    }

    return updated;
  },

  updateRestaurantDocumentStatus(restaurantId, docId, { status, reason = '' }) {
    const updated = this.getRestaurants().map((restaurant) => {
      if (restaurant.id !== restaurantId && restaurant.referenceNumber !== restaurantId) {
        return restaurant;
      }

      // Update documents array or documentStatuses map
      let docs = Array.isArray(restaurant.documents) ? [...restaurant.documents] : [];
      let docUpdated = false;

      docs = docs.map((doc) => {
        const match = typeof doc === 'string' ? doc === docId : (doc.id === docId || doc.name === docId);
        if (match) {
          docUpdated = true;
          return typeof doc === 'string'
            ? { id: doc, name: doc, verificationStatus: status, rejectionReason: reason }
            : { ...doc, verificationStatus: status, rejectionReason: reason };
        }
        return doc;
      });

      if (!docUpdated) {
        docs.push({ id: docId, name: docId, verificationStatus: status, rejectionReason: reason });
      }

      const documentStatuses = {
        ...(restaurant.documentStatuses || {}),
        [docId]: { status, reason, updatedAt: new Date().toISOString() },
      };

      const event = {
        id: `doc-status-${Date.now()}`,
        title: `Document ${status}: ${docId}`,
        description: reason ? `Reason: ${reason}` : `Document marked as ${status} by admin reviewer.`,
        time: new Date().toISOString(),
      };

      return {
        ...restaurant,
        documents: docs,
        documentStatuses,
        applicationHistory: [...(restaurant.applicationHistory || []), event],
      };
    });

    write(STORAGE_KEYS.restaurants, updated);
    return updated;
  },

  requestAdditionalDocuments(restaurantId, { documentName, reason, instructions, dueDate = '' }) {
    const newRequest = {
      id: `req-${Date.now()}`,
      documentName,
      reason,
      instructions,
      dueDate,
      status: 'Pending Applicant',
      requestedAt: new Date().toISOString(),
    };

    const updated = this.getRestaurants().map((restaurant) => {
      if (restaurant.id !== restaurantId && restaurant.referenceNumber !== restaurantId) {
        return restaurant;
      }

      const requestedDocuments = [...(restaurant.requestedDocuments || []), newRequest];
      const event = {
        id: `req-hist-${Date.now()}`,
        title: 'Additional Document Requested',
        description: `${documentName}: ${reason}${instructions ? ` (Instructions: ${instructions})` : ''}`,
        time: new Date().toISOString(),
      };

      return {
        ...restaurant,
        status: 'Additional Documents Required',
        applicationStatus: 'Additional Documents Required',
        requestedDocuments,
        applicationHistory: [...(restaurant.applicationHistory || []), event],
      };
    });

    write(STORAGE_KEYS.restaurants, updated);

    // Sync to salo_partner_applications
    try {
      const partnerAppsKey = 'salo_partner_applications';
      const stored = localStorage.getItem(partnerAppsKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.restaurant) {
          parsed.restaurant = {
            ...parsed.restaurant,
            status: 'Additional Documents Required',
            applicationStatus: 'Additional Documents Required',
            requestedDocuments: [...(parsed.restaurant.requestedDocuments || []), newRequest],
          };
          localStorage.setItem(partnerAppsKey, JSON.stringify(parsed));
        }
      }
    } catch {
      // ignore
    }

    return { updated, newRequest };
  },

  submitRequestedDocument(restaurantId, requestId, documentData) {
    const submissionTime = new Date().toISOString();
    const updated = this.getRestaurants().map((restaurant) => {
      if (restaurant.id !== restaurantId && restaurant.referenceNumber !== restaurantId) {
        return restaurant;
      }

      const requestedDocuments = (restaurant.requestedDocuments || []).map((req) => {
        if (req.id === requestId || !requestId) {
          return {
            ...req,
            status: 'Submitted',
            submittedAt: submissionTime,
            document: documentData,
          };
        }
        return req;
      });

      const docs = Array.isArray(restaurant.documents) ? [...restaurant.documents] : [];
      docs.push({
        id: documentData.id || `req-doc-${Date.now()}`,
        name: documentData.name,
        type: documentData.type,
        size: documentData.size,
        uploadedAt: submissionTime,
        classification: 'requested',
        verificationStatus: 'Pending Review',
      });

      const event = {
        id: `submit-doc-${Date.now()}`,
        title: 'Requested Document Uploaded',
        description: `Applicant uploaded ${documentData.name} in response to request.`,
        time: submissionTime,
      };

      return {
        ...restaurant,
        status: 'Under Review',
        applicationStatus: 'Under Review',
        requestedDocuments,
        documents: docs,
        applicationHistory: [...(restaurant.applicationHistory || []), event],
      };
    });

    write(STORAGE_KEYS.restaurants, updated);

    // Sync to partner applications
    try {
      const partnerAppsKey = 'salo_partner_applications';
      const stored = localStorage.getItem(partnerAppsKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.restaurant) {
          parsed.restaurant = {
            ...parsed.restaurant,
            status: 'Under Review',
            applicationStatus: 'Under Review',
            requestedDocuments: (parsed.restaurant.requestedDocuments || []).map((req) =>
              req.id === requestId || !requestId
                ? { ...req, status: 'Submitted', submittedAt: submissionTime, document: documentData }
                : req
            ),
          };
          localStorage.setItem(partnerAppsKey, JSON.stringify(parsed));
        }
      }
    } catch {
      // ignore
    }

    return updated;
  },

  updateRestaurantCommission(id, rate) {
    const updated = this.getRestaurants().map((restaurant) => restaurant.id === id ? { ...restaurant, commissionRate: Number(rate) } : restaurant);
    write(STORAGE_KEYS.restaurants, updated);
    return updated;
  },

  getRiders() {
    return read('riders', STORAGE_KEYS.riders);
  },

  updateRiderStatus(id, status, details = {}) {
    const updated = this.getRiders().map((rider) => rider.id === id ? { ...rider, ...details, status } : rider);
    write(STORAGE_KEYS.riders, updated);
    return updated;
  },

  getOrders() {
    return getOrdersWithFinancials();
  },

  getUsers() {
    return read('accounts', STORAGE_KEYS.users);
  },

  updateUserStatus(id, status) {
    const updated = this.getUsers().map((user) => user.id === id ? { ...user, status } : user);
    write(STORAGE_KEYS.users, updated);
    return updated;
  },

  getConfig() {
    return read('settings', STORAGE_KEYS.config);
  },

  updateConfig(data) {
    const updated = { ...this.getConfig(), ...data };
    write(STORAGE_KEYS.config, updated);
    return updated;
  },
};

export default adminService;
