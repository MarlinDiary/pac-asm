import { Types } from 'mongoose'
import UserModel, { User } from '../models/user'

// Storage/grouping keys may be private emails. Never use them as public IDs.
export function publicUserId(user: Pick<User, '_id' | 'githubId'>): string {
  return user.githubId && /^\d+$/.test(user.githubId)
    ? `github:${user.githubId}`
    : `user:${user._id.toString()}`
}

export async function resolvePublicUserIds(storedIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(storedIds)]
  const result = new Map<string, string>()
  if (ids.length === 0) return result

  const users = await UserModel.find({ $or: [
    { email: { $in: ids } },
    { githubId: { $in: ids } },
    { _id: { $in: ids.filter(id => Types.ObjectId.isValid(id)) } }
  ] }).select('_id email githubId').lean().exec()

  for (const user of users) {
    const id = publicUserId(user)
    for (const key of [user.email, user.githubId, user._id.toString()]) {
      if (key) result.set(key, id)
    }
  }
  return result
}

export function publicUserName(name: string): string {
  // Older records can have an email as their fallback display name as well.
  return /[^\s@]+@[^\s@]+/.test(name) ? 'Player' : name
}
