import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useBugReport, uploadScreenshot } from '../hooks/useBugReport';
import { BUG_CATEGORIES, BUG_APPS } from '../types';
import { useUserStore } from '../../../store/userStore';
import { toast } from 'react-toastify';

interface BugReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_SCREENSHOTS = 3;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const DRAFT_KEY = 'bug-report-draft';

interface DraftData {
  title: string;
  app: string;
  category: string;
  description: string;
  reproSteps: string;
}

export default function BugReportModal({ open, onOpenChange }: BugReportModalProps) {
  const [title, setTitle] = useState('');
  const [app, setApp] = useState<string>('nasun');
  const [category, setCategory] = useState('Other');
  const [description, setDescription] = useState('');
  const [reproSteps, setReproSteps] = useState('');
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { mutate, isPending, walletConnected } = useBugReport();
  const user = useUserStore((s) => s.user);

  // Restore draft when modal opens. Surface a dismissable notice so the user
  // knows their previous text was preserved (and can discard it).
  useEffect(() => {
    if (!open) {
      setDraftRestored(false);
      return;
    }
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft: DraftData = JSON.parse(raw);
      const hasContent = !!(draft.title || draft.description || draft.reproSteps);
      if (draft.title) setTitle(draft.title);
      if (draft.app) setApp(draft.app);
      if (draft.category) setCategory(draft.category);
      if (draft.description) setDescription(draft.description);
      if (draft.reproSteps) setReproSteps(draft.reproSteps);
      if (hasContent) setDraftRestored(true);
    } catch {
      // ignore malformed draft
    }
  }, [open]);

  // Persist draft on every keystroke
  useEffect(() => {
    if (!open) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, app, category, description, reproSteps }));
    } catch {
      // ignore storage errors (private mode, quota, etc.)
    }
  }, [open, title, app, category, description, reproSteps]);

  // Warn before the page unloads while the form has unsaved content. The draft
  // is also persisted to localStorage, but a refresh on mobile easily wipes
  // the user's mental state, so a native confirm prompt is the clearest signal.
  useEffect(() => {
    if (!open) return;
    const dirty = !!(title.trim() || description.trim() || reproSteps.trim() || screenshots.length);
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [open, title, description, reproSteps, screenshots]);

  // Keep localStorage draft so accidental close (Cancel / Escape / outside
  // click) does not wipe a long report in progress. Only successful submit
  // clears the saved draft (see handleSubmit onSuccess).
  const resetForm = () => {
    setTitle('');
    setApp('nasun');
    setCategory('Other');
    setDescription('');
    setReproSteps('');
    setScreenshots([]);
    setIsUploading(false);
  };

  const clearSavedDraft = () => {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  };

  const discardDraft = () => {
    clearSavedDraft();
    resetForm();
    setDraftRestored(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

  const addFiles = useCallback((files: FileList | File[]) => {
    const newFiles = Array.from(files).filter((f) => {
      if (!ALLOWED_TYPES.includes(f.type)) {
        toast.error('Only PNG, JPEG, and WebP images are allowed');
        return false;
      }
      if (f.size > MAX_FILE_SIZE) {
        toast.error('File size must be under 5MB');
        return false;
      }
      return true;
    });

    setScreenshots((prev) => {
      const combined = [...prev, ...newFiles];
      if (combined.length > MAX_SCREENSHOTS) {
        toast.error(`Maximum ${MAX_SCREENSHOTS} screenshots`);
        return combined.slice(0, MAX_SCREENSHOTS);
      }
      return combined;
    });
  }, []);

  // Generate preview URLs and revoke on cleanup
  const previewUrls = useMemo(() => screenshots.map((f) => URL.createObjectURL(f)), [screenshots]);
  useEffect(() => {
    return () => { previewUrls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [previewUrls]);

  const removeScreenshot = (index: number) => {
    URL.revokeObjectURL(previewUrls[index]);
    setScreenshots((prev) => prev.filter((_, i) => i !== index));
  };

  // Handle clipboard paste
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const imageFiles: File[] = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      addFiles(imageFiles);
    }
  }, [addFiles]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !user?.cognitoToken) return;

    try {
      // Upload screenshots first
      let screenshotKeys: string[] = [];
      if (screenshots.length > 0) {
        setIsUploading(true);
        screenshotKeys = await Promise.all(
          screenshots.map((file) => uploadScreenshot(file, user.cognitoToken!)),
        );
        setIsUploading(false);
      }

      mutate(
        {
          title: title.trim(),
          app,
          category,
          description: description.trim(),
          reproSteps: reproSteps.trim() || undefined,
          screenshotKeys: screenshotKeys.length > 0 ? screenshotKeys : undefined,
          pageUrl: window.location.href,
        },
        {
          onSuccess: () => {
            toast.success('Bug report submitted. Thank you!');
            clearSavedDraft();
            resetForm();
            onOpenChange(false);
          },
          onError: (err) => {
            toast.error(`Failed to submit: ${err.message}`);
          },
        },
      );
    } catch (err) {
      setIsUploading(false);
      toast.error(`Screenshot upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const isSubmitting = isPending || isUploading;

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50 animate-in fade-in" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-lg bg-nasun-black border border-white/10 rounded-xl p-6 shadow-2xl animate-in fade-in slide-in-from-bottom-2 max-h-[85vh] overflow-y-auto"
          onPaste={handlePaste}
        >
          <Dialog.Title className="text-lg font-semibold text-white mb-4">
            Bug Report & Feedback
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            Submit a bug report or feedback for the Nasun website
          </Dialog.Description>

          {draftRestored && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-nasun-c4/40 bg-nasun-c4/10 px-3 py-2 text-sm text-white/80">
              <span>Draft restored from your previous session.</span>
              <button
                type="button"
                onClick={discardDraft}
                className="px-2 py-1 text-xs font-medium text-white/70 hover:text-white underline decoration-dotted underline-offset-2"
              >
                Discard
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Title */}
            <div>
              <label className="block text-sm text-white/60 mb-1">Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 100))}
                placeholder="Brief description of the issue"
                required
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-nasun-c4/50"
              />
              <span className="text-xs text-white/40">{title.length}/100</span>
            </div>

            {/* App */}
            <div>
              <label className="block text-sm text-white/60 mb-1">App *</label>
              <select
                value={app}
                onChange={(e) => setApp(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-nasun-c4/50"
              >
                {BUG_APPS.map((a) => (
                  <option key={a} value={a} className="bg-nasun-black">{a}</option>
                ))}
              </select>
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm text-white/60 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-nasun-c4/50"
              >
                {BUG_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat} className="bg-nasun-black">{cat}</option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm text-white/60 mb-1">Description *</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
                placeholder="What happened? What did you expect to happen?"
                required
                rows={4}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-nasun-c4/50 resize-none"
              />
              <span className="text-xs text-white/40">{description.length}/2000</span>
            </div>

            {/* Repro Steps */}
            <div>
              <label className="block text-sm text-white/60 mb-1">Steps to Reproduce (optional)</label>
              <textarea
                value={reproSteps}
                onChange={(e) => setReproSteps(e.target.value.slice(0, 2000))}
                placeholder={"1. Go to...\n2. Click on...\n3. See error"}
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-nasun-c4/50 resize-none"
              />
              <span className="text-xs text-white/40">{reproSteps.length}/2000</span>
            </div>

            {/* Screenshots */}
            <div>
              <label className="block text-sm text-white/60 mb-1">
                Screenshots (optional, max {MAX_SCREENSHOTS})
              </label>
              <div className="space-y-2">
                {screenshots.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {screenshots.map((file, i) => (
                      <div key={i} className="relative group">
                        <img
                          src={previewUrls[i]}
                          alt={`Screenshot ${i + 1}`}
                          className="w-20 h-20 object-cover rounded-lg border border-white/10"
                        />
                        <button
                          type="button"
                          onClick={() => removeScreenshot(i)}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {screenshots.length < MAX_SCREENSHOTS && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 py-2 border border-dashed border-white/20 rounded-lg text-sm text-white/40 text-center">
                      Paste screenshot here (Ctrl+V)
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-2 text-sm font-medium bg-white/5 text-white/60 border border-white/10 rounded-lg hover:bg-white/10 hover:text-white/80 transition-colors whitespace-nowrap"
                    >
                      Upload File
                    </button>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) addFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </div>
            </div>

            {/* Wallet warning */}
            {!walletConnected && (
              <p className="text-xs text-yellow-400/80">
                Connect your Nasun wallet to submit and earn rewards.
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="flex-1 px-4 py-2 bg-white/5 text-white/60 rounded-lg text-sm hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={isSubmitting || !title.trim() || !description.trim() || !walletConnected}
                className="flex-1 px-4 py-2 bg-nasun-c4 text-white rounded-lg text-sm font-medium hover:bg-nasun-c4/80 disabled:bg-white/10 disabled:text-white/50 disabled:cursor-not-allowed transition-colors"
              >
                {isUploading ? 'Uploading...' : isPending ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
