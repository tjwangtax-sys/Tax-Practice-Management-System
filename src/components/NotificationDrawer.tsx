import React, { useState } from 'react';
import { X, Megaphone, MessageSquarePlus, CheckCheck, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { emailToStaffKey } from '../lib/firebase';

interface NotificationDrawerProps {
  open: boolean;
  onClose: () => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({ open, onClose }) => {
  const { user, role, isManagerOrAdmin, isReadOnly } = useAuth();
  const {
    notifications,
    publishAnnouncement,
    sendSuggestion,
    markNotificationRead,
    markAllNotificationsRead,
    localReadIds,
  } = useData();

  const [filterTab, setFilterTab] = useState<'all' | 'announcement' | 'suggestion'>('all');
  const [suggTitle, setSuggTitle] = useState('');
  const [suggMessage, setSuggMessage] = useState('');
  const [suggBusy, setSuggBusy] = useState(false);
  const [suggFeedback, setSuggFeedback] = useState<string | null>(null);

  const [annTitle, setAnnTitle] = useState('');
  const [annMessage, setAnnMessage] = useState('');
  const [annTarget, setAnnTarget] = useState<'ALL' | 'Admin' | 'Manager-HOD'>('ALL');
  const [annBusy, setAnnBusy] = useState(false);
  const [annFeedback, setAnnFeedback] = useState<string | null>(null);

  if (!open) return null;

  const staffKey = user?.email ? emailToStaffKey(user.email) : '';

  const isUnread = (id: string, readBy: string[]) => {
    if (role === 'Report Viewer') return !localReadIds.includes(id);
    return !readBy.includes(staffKey);
  };

  const filtered = notifications.filter((n) => {
    if (filterTab === 'all') return true;
    return n.type === filterTab;
  });

  const handleSendSuggestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!suggTitle.trim() || !suggMessage.trim() || isReadOnly) return;
    setSuggBusy(true);
    setSuggFeedback(null);
    try {
      await sendSuggestion(suggTitle.trim(), suggMessage.trim());
      setSuggTitle('');
      setSuggMessage('');
      setSuggFeedback('Suggestion submitted to practice leadership.');
    } finally {
      setSuggBusy(false);
    }
  };

  const handlePublishAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!annTitle.trim() || !annMessage.trim() || !isManagerOrAdmin) return;
    setAnnBusy(true);
    setAnnFeedback(null);
    try {
      await publishAnnouncement(annTitle.trim(), annMessage.trim(), annTarget);
      setAnnTitle('');
      setAnnMessage('');
      setAnnFeedback('Announcement published to staff.');
    } finally {
      setAnnBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end no-print">
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-md bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col">
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="font-display font-semibold text-sm text-slate-900">
              Notifications & Practice Feed
            </h2>
            <p className="text-[11px] text-slate-500">
              Announcements, team suggestions, and deadline notices
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void markAllNotificationsRead()}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-teal-700 hover:bg-teal-50 rounded transition-colors"
              title="Mark all as read"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              aria-label="Close notifications"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Segmented Control */}
        <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/70">
          <div className="inline-flex p-0.5 bg-slate-200/70 rounded-md">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'announcement', label: 'Announcements' },
                { id: 'suggestion', label: 'Suggestions' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setFilterTab(t.id)}
                className={`px-3 py-1 text-[11px] font-medium rounded transition-colors ${
                  filterTab === t.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Feed */}
          <div className="space-y-2.5">
            {filtered.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-slate-200 rounded-lg">
                <p className="text-xs font-medium text-slate-600">No notifications yet</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Published announcements and staff suggestions will appear here.
                </p>
              </div>
            ) : (
              filtered.map((item) => {
                const unread = isUnread(item.id, item.readBy);
                const ts = item.createdAt?.toDate
                  ? item.createdAt.toDate().toLocaleString('en-MY', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })
                  : 'Just now';

                return (
                  <div
                    key={item.id}
                    onClick={() => unread && void markNotificationRead(item.id)}
                    className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                      unread
                        ? 'bg-teal-50/50 border-teal-200'
                        : 'bg-white border-slate-200 hover:bg-slate-50/70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs font-semibold text-slate-900 leading-snug">
                        {item.title}
                      </div>
                      <span className="text-[10px] font-medium text-slate-500 capitalize shrink-0">
                        {item.type}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">
                      {item.message}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                      <span>
                        {item.authorName} · {item.authorRole}
                      </span>
                      <span className="font-mono">{ts}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Publish Announcement Box (Admin / Manager-HOD only) */}
          {isManagerOrAdmin && (
            <form
              onSubmit={(e) => void handlePublishAnnouncement(e)}
              className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/80 space-y-2.5"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                <Megaphone className="w-3.5 h-3.5 text-teal-700" />
                Publish announcement
              </div>
              <input
                type="text"
                required
                maxLength={160}
                value={annTitle}
                onChange={(e) => setAnnTitle(e.target.value)}
                placeholder="Announcement headline (e.g. Form E Filing Cutoff)"
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-teal-700"
              />
              <textarea
                required
                rows={3}
                maxLength={2000}
                value={annMessage}
                onChange={(e) => setAnnMessage(e.target.value)}
                placeholder="Write practice-wide directive or LHDN update..."
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-teal-700 resize-none"
              />
              <div className="flex items-center justify-between gap-2">
                <select
                  value={annTarget}
                  onChange={(e) => setAnnTarget(e.target.value as 'ALL' | 'Admin' | 'Manager-HOD')}
                  className="px-2 py-1 text-[11px] bg-white border border-slate-200 rounded-md text-slate-700"
                >
                  <option value="ALL">Audience: All Staff</option>
                  <option value="Manager-HOD">Audience: Manager-HOD</option>
                  <option value="Admin">Audience: Admin</option>
                </select>
                <button
                  type="submit"
                  disabled={annBusy}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md disabled:opacity-50 transition-colors"
                >
                  {annBusy ? 'Publishing...' : 'Publish'}
                </button>
              </div>
              {annFeedback && <p className="text-[11px] text-emerald-700 font-medium">{annFeedback}</p>}
            </form>
          )}

          {/* Send a Suggestion Box */}
          {isReadOnly ? (
            <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50 flex items-center gap-2 text-xs text-slate-500">
              <Lock className="w-3.5 h-3.5 shrink-0" />
              Report Viewer accounts are strictly read-only and cannot submit suggestions.
            </div>
          ) : (
            <form
              onSubmit={(e) => void handleSendSuggestion(e)}
              className="border border-slate-200 rounded-lg p-3.5 bg-white space-y-2.5"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                <MessageSquarePlus className="w-3.5 h-3.5 text-slate-600" />
                Send a suggestion
              </div>
              <input
                type="text"
                required
                maxLength={160}
                value={suggTitle}
                onChange={(e) => setSuggTitle(e.target.value)}
                placeholder="Suggestion subject"
                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:outline-none focus:border-teal-700"
              />
              <textarea
                required
                rows={3}
                maxLength={2000}
                value={suggMessage}
                onChange={(e) => setSuggMessage(e.target.value)}
                placeholder="Share workflow feedback or feature requests with management..."
                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:outline-none focus:border-teal-700 resize-none"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={suggBusy}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-md disabled:opacity-50 transition-colors"
                >
                  {suggBusy ? 'Sending...' : 'Send Suggestion'}
                </button>
              </div>
              {suggFeedback && (
                <p className="text-[11px] text-emerald-700 font-medium">{suggFeedback}</p>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
