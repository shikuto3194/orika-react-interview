import { useNavigate } from 'react-router-dom';
import { AccountLinkSettings } from './AccountLinkSettings';
import './account-link.css';

export default function AdminAccountsPage() {
  const navigate = useNavigate();
  return <div className="account-link-page"><div className="account-link-card">
    <AccountLinkSettings onBack={() => navigate('/admin')} />
  </div></div>;
}
