"use client";

import { useState, useRef, useEffect } from "react";
import { api } from "~/trpc/react";
import { usePrivy } from "@privy-io/react-auth";
import { AuthGuard } from "~/app/_components/auth-guard";

export default function ProfileSettingsPage() {
  const { user: privyUser } = usePrivy();
  const utils = api.useUtils();

  const { data: me, isLoading } = api.user.getMe.useQuery();

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [initialized, setInitialized] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Pre-populate form when profile data loads
  useEffect(() => {
    if (initialized || !me) return;
    setDisplayName(me.displayName ?? "");
    setBio(me.bio ?? "");
    setInitialized(true);
  }, [me, initialized]);

  const updateProfile = api.profile.update.useMutation({
    onSuccess: () => {
      void utils.user.getMe.invalidate();
      void utils.user.invalidate();
    },
  });
  const uploadAvatar = api.profile.uploadAvatar.useMutation({
    onSuccess: () => {
      void utils.user.getMe.invalidate();
      void utils.user.invalidate();
    },
  });

  function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Image must be under 2MB");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      alert("Only JPEG, PNG, and WebP images are allowed");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuffer = reader.result as ArrayBuffer;
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ""),
      );
      uploadAvatar.mutate({
        fileBase64: base64,
        contentType: file.type as "image/jpeg" | "image/png" | "image/webp",
      });
    };
    reader.readAsArrayBuffer(file);
  }

  if (isLoading) {
    return (
      <AuthGuard>
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-gray-500">Loading profile...</p>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <main className="mx-auto max-w-xl px-4 py-8">
        <h1 className="text-2xl font-bold">Profile Settings</h1>

        {/* Avatar */}
        <section className="mt-6">
          <label className="text-sm font-medium text-gray-700">Avatar</label>
          <div className="mt-2 flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-gray-200 overflow-hidden">
              {me?.avatar ? (
                <img src={me.avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-2xl text-gray-400">
                  {(me?.displayName ?? "?")[0]?.toUpperCase()}
                </div>
              )}
            </div>
            <button
              onClick={() => fileInput.current?.click()}
              className="rounded border px-3 py-1 text-sm"
            >
              {uploadAvatar.isPending ? "Uploading..." : "Upload"}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleAvatarUpload}
              className="hidden"
            />
          </div>
        </section>

        {/* Display Name */}
        <section className="mt-6">
          <label className="text-sm font-medium text-gray-700">Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value.slice(0, 50))}
            className="mt-1 w-full rounded border px-3 py-2"
            placeholder="Your name"
          />
          <p className="mt-1 text-right text-xs text-gray-400">{displayName.length}/50</p>
        </section>

        {/* Bio */}
        <section className="mt-6">
          <label className="text-sm font-medium text-gray-700">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 200))}
            className="mt-1 w-full rounded border px-3 py-2"
            rows={3}
            placeholder="Tell us about yourself"
          />
          <p className="mt-1 text-right text-xs text-gray-400">{bio.length}/200</p>
        </section>

        <button
          onClick={() => updateProfile.mutate({ displayName, bio })}
          disabled={updateProfile.isPending}
          className="mt-6 rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {updateProfile.isPending ? "Saving..." : "Save Changes"}
        </button>

        {updateProfile.isSuccess && (
          <p className="mt-2 text-sm text-green-600">Profile saved!</p>
        )}

        {/* Read-only fields */}
        <section className="mt-8 border-t pt-6">
          <h2 className="text-sm font-medium text-gray-700">Account Info</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-gray-500">Wallet Address</dt>
              <dd className="font-mono text-gray-700">{me?.walletAddress ?? privyUser?.wallet?.address ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Email</dt>
              <dd className="text-gray-700">{me?.email ?? privyUser?.email?.address ?? "—"}</dd>
            </div>
          </dl>
        </section>
      </main>
    </AuthGuard>
  );
}
