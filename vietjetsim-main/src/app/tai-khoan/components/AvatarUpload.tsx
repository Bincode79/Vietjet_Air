'use client';

import React, { useState, useCallback } from 'react';
import { Icon } from '@/shared/components/ui';
import { useToast } from '@/hooks/useToast';
import { apiRequest, getApiErrorMessage } from '@/shared/services';

interface AvatarUploadProps {
  currentAvatarUrl: string | null;
  onAvatarChange: (url: string) => void;
}

export default function AvatarUpload({ currentAvatarUrl, onAvatarChange }: AvatarUploadProps) {
  const toast = useToast();
  const [preview, setPreview] = useState<string | null>(currentAvatarUrl);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Client-side validation
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        toast.error('Lỗi', 'Chỉ chấp nhận file JPEG, PNG, WebP.');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Lỗi', 'File quá lớn. Tối đa 5MB.');
        return;
      }

      // Preview
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(file);

      // Upload
      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append('avatar', file);

        const data = await apiRequest<{ success: boolean; avatarUrl: string }>(
          '/api/nguoi-dung/avatar',
          {
            method: 'POST',
            body: formData,
            // Don't set Content-Type - browser will set multipart/form-data with boundary
          }
        );

        onAvatarChange(data.avatarUrl);
        toast.success('Thành công', 'Đã cập nhật avatar.');
      } catch (error) {
        setPreview(currentAvatarUrl);
        toast.error('Lỗi', getApiErrorMessage(error, 'Không thể tải lên avatar.'));
      } finally {
        setIsUploading(false);
      }
    },
    [currentAvatarUrl, onAvatarChange, toast]
  );

  const handleDelete = useCallback(async () => {
    if (!confirm('Bạn có chắc muốn xóa avatar?')) return;

    setIsDeleting(true);
    try {
      await apiRequest('/api/nguoi-dung/avatar', { method: 'DELETE' });
      setPreview(null);
      onAvatarChange('');
      toast.success('Thành công', 'Đã xóa avatar.');
    } catch (error) {
      toast.error('Lỗi', getApiErrorMessage(error, 'Không thể xóa avatar.'));
    } finally {
      setIsDeleting(false);
    }
  }, [onAvatarChange, toast]);

  const getInitials = (_url: string | null) => {
    // This would need user name passed as prop in real usage
    return 'U';
  };

  return (
    <div className="relative inline-block">
      <div
        className="w-32 h-32 rounded-full overflow-hidden border-4 border-[rgb(var(--primary-rgb))]/10 mx-auto"
        style={{
          background: 'linear-gradient(135deg, var(--vj-navy) 0%, var(--vj-navy-2) 100%)',
        }}
      >
        {preview ? (
          <img src={preview} alt="Avatar" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-4xl font-bold text-white font-[KoHo,sans-serif]">
              {getInitials(currentAvatarUrl)}
            </span>
          </div>
        )}
      </div>

      <label
        htmlFor="avatar-upload"
        className="absolute bottom-0 right-0 w-10 h-10 bg-[var(--primary)] rounded-full flex items-center justify-center cursor-pointer hover:bg-[var(--primary-dark)] transition-colors shadow-vj-lg"
        title={preview ? 'Thay đổi avatar' : 'Thêm avatar'}
      >
        <Icon name="CameraIcon" size={18} className="text-white" />
        <input
          id="avatar-upload"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
          disabled={isUploading || isDeleting}
        />
      </label>

      {preview && (
        <button
          onClick={handleDelete}
          disabled={isUploading || isDeleting}
          className="absolute bottom-0 left-0 w-10 h-10 bg-red-500 rounded-full flex items-center justify-center cursor-pointer hover:bg-red-600 transition-colors shadow-vj-lg"
          title="Xóa avatar"
        >
          <Icon name="TrashIcon" size={16} className="text-white" />
        </button>
      )}

      {(isUploading || isDeleting) && (
        <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center z-10">
          <Icon name="ArrowPathIcon" size={24} className="text-white animate-spin" />
        </div>
      )}
    </div>
  );
}
