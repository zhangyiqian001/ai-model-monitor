import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { EyeIcon, EyeOffIcon } from 'lucide-react';

interface ConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platformName: string;
  existingKeyMasked?: string;
  hasKey: boolean;
  initialNotes?: string;
  initialEnabled?: boolean;
  onSave: (data: { apiKey: string; notes: string; isEnabled: boolean }) => Promise<void>;
  saving: boolean;
}

export function ConfigDialog({
  open,
  onOpenChange,
  platformName,
  existingKeyMasked,
  hasKey,
  initialNotes = '',
  initialEnabled = true,
  onSave,
  saving,
}: ConfigDialogProps) {
  const [apiKey, setApiKey] = useState('');
  const [notes, setNotes] = useState(initialNotes);
  const [isEnabled, setIsEnabled] = useState(initialEnabled);
  const [showKey, setShowKey] = useState(false);

  const handleSave = async () => {
    await onSave({ apiKey, notes, isEnabled });
    setApiKey('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>配置 API Key - {platformName}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="config-api-key" className="text-xs text-gray-500">
              API Key
            </Label>
            <div className="relative">
              <Input
                id="config-api-key"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={existingKeyMasked ?? '请输入 API Key'}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showKey ? (
                  <EyeOffIcon className="size-4" />
                ) : (
                  <EyeIcon className="size-4" />
                )}
              </button>
            </div>
            {hasKey && (
              <p className="text-xs text-gray-400">
                当前 Key：{existingKeyMasked}（留空则不修改）
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="config-notes" className="text-xs text-gray-500">
              备注（可选）
            </Label>
            <Textarea
              id="config-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="备注信息"
              className="min-h-[60px]"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-500">启用</Label>
            <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            className="bg-[#1890ff] text-white hover:bg-[#1890ff]/90"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ConfigDialog;
