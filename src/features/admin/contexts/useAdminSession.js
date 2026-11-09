import { useContext } from 'react';
import AdminSessionContext from './adminSessionStore';

export default function useAdminSession() {
  const context = useContext(AdminSessionContext);
  if (!context) throw new Error('useAdminSession must be used within AdminSessionProvider');
  return context;
}
