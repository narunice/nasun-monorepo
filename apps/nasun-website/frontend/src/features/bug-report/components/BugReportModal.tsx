import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useBugReport } from '../hooks/useBugReport';
import { BUG_CATEGORIES } from '../types';
import { toast } from 'react-toastify';

interface BugReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function BugReportModal({ open, onOpenChange }: BugReportModalProps) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Other');
  const [description, setDescription] = useState('');
  const [reproSteps, setReproSteps] = useState('');
  const { mutate, isPending } = useBugReport();

  const resetForm = () => {
    setTitle('');
    setCategory('Other');
    setDescription('');
    setReproSteps('');
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    mutate(
      { title: title.trim(), category, description: description.trim(), reproSteps: reproSteps.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('Bug report submitted. Thank you!');
          resetForm();
          onOpenChange(false);
        },
        onError: (err) => {
          toast.error(`Failed to submit: ${err.message}`);
        },
      }
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50 animate-in fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-md bg-nasun-black border border-white/10 rounded-xl p-6 shadow-2xl animate-in fade-in slide-in-from-bottom-2">
          <Dialog.Title className="text-lg font-semibold text-white mb-4">
            Report a Bug
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            Submit a bug report for the Nasun website
          </Dialog.Description>

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
              <span className="text-[10px] text-white/20">{title.length}/100</span>
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
              <span className="text-[10px] text-white/20">{description.length}/2000</span>
            </div>

            {/* Repro Steps */}
            <div>
              <label className="block text-sm text-white/60 mb-1">Steps to Reproduce (optional)</label>
              <textarea
                value={reproSteps}
                onChange={(e) => setReproSteps(e.target.value.slice(0, 2000))}
                placeholder="1. Go to...&#10;2. Click on...&#10;3. See error"
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-nasun-c4/50 resize-none"
              />
            </div>

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
                disabled={isPending || !title.trim() || !description.trim()}
                className="flex-1 px-4 py-2 bg-nasun-c4 text-white rounded-lg text-sm font-medium hover:bg-nasun-c4/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                {isPending ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
