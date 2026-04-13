import mongoose from 'mongoose';
import { Request } from 'express';

import UserModel, { User } from '../models/user';

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_USER_AGENT = 'PacAsm-App';

interface GitHubUserResponse {
  id?: number | string;
  login?: string | null;
  name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
}

interface GitHubEmailResponse {
  email?: string;
  primary?: boolean;
  verified?: boolean;
}

export interface VerifiedGitHubIdentity {
  githubId: string;
  login?: string;
  email?: string;
  name: string;
  avatarUrl?: string;
}

export interface SyncedGitHubUser {
  record: PersistedUser;
  submissionUserId: string;
  submissionUserName: string;
  submissionAvatarUrl?: string;
}

type PersistedUser = mongoose.Document<unknown, {}, User> & User & {
  _id: mongoose.Types.ObjectId;
}

export class GitHubAuthError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export async function requireVerifiedGitHubIdentity(req: Request): Promise<VerifiedGitHubIdentity> {
  const accessToken = getBearerToken(req.headers.authorization);
  if (!accessToken) {
    throw new GitHubAuthError(401, 'GitHub authentication is required');
  }

  const githubUser = await fetchGitHubUser(accessToken);
  const githubId = normalizeString(githubUser.id);
  if (!githubId) {
    throw new GitHubAuthError(502, 'GitHub user response did not include an id');
  }

  const login = normalizeString(githubUser.login);
  const email = (normalizeString(githubUser.email) ?? await fetchPrimaryGitHubEmail(accessToken))?.toLowerCase();
  const name = normalizeString(githubUser.name) ?? login ?? email ?? `github:${githubId}`;
  const avatarUrl = normalizeString(githubUser.avatar_url);

  return {
    githubId,
    login,
    email,
    name,
    avatarUrl,
  };
}

export async function syncVerifiedGitHubUser(identity: VerifiedGitHubIdentity): Promise<SyncedGitHubUser> {
  const filter = identity.email
    ? { $or: [{ githubId: identity.githubId }, { email: identity.email }] }
    : { githubId: identity.githubId };

  const record = await UserModel.findOneAndUpdate(
    filter,
    {
      email: identity.email,
      githubId: identity.githubId,
      name: identity.name,
      avatarUrl: identity.avatarUrl,
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  ).exec() as PersistedUser;

  const submissionUserId = record.email ?? record.githubId ?? record._id.toString();
  const submissionUserName = normalizeString(record.name) ?? identity.name;
  const submissionAvatarUrl = normalizeString(record.avatarUrl) ?? identity.avatarUrl;

  return {
    record,
    submissionUserId,
    submissionUserName,
    submissionAvatarUrl,
  };
}

async function fetchGitHubUser(accessToken: string): Promise<GitHubUserResponse> {
  const response = await fetch(`${GITHUB_API_BASE}/user`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': GITHUB_USER_AGENT,
    },
  });

  if (response.status === 401) {
    throw new GitHubAuthError(401, 'GitHub access token is invalid or expired');
  }

  if (!response.ok) {
    throw new GitHubAuthError(502, `GitHub user lookup failed with status ${response.status}`);
  }

  return response.json() as Promise<GitHubUserResponse>;
}

async function fetchPrimaryGitHubEmail(accessToken: string): Promise<string | undefined> {
  const response = await fetch(`${GITHUB_API_BASE}/user/emails`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': GITHUB_USER_AGENT,
    },
  });

  if (response.status === 401) {
    throw new GitHubAuthError(401, 'GitHub access token is invalid or expired');
  }

  if (response.status === 403 || response.status === 404) {
    return undefined;
  }

  if (!response.ok) {
    throw new GitHubAuthError(502, `GitHub email lookup failed with status ${response.status}`);
  }

  const emails = await response.json() as GitHubEmailResponse[];
  const primaryVerified = emails.find((entry) => entry.primary && entry.verified && normalizeString(entry.email));
  const verified = emails.find((entry) => entry.verified && normalizeString(entry.email));
  const primary = emails.find((entry) => entry.primary && normalizeString(entry.email));
  const fallback = emails.find((entry) => normalizeString(entry.email));

  return normalizeString(primaryVerified?.email)
    ?? normalizeString(verified?.email)
    ?? normalizeString(primary?.email)
    ?? normalizeString(fallback?.email);
}

function getBearerToken(headerValue: string | undefined): string | undefined {
  if (!headerValue) {
    return undefined;
  }

  const [scheme, token] = headerValue.trim().split(/\s+/, 2);
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return undefined;
  }

  return token;
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
