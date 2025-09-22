import { Model, Schema, model, models, Types } from 'mongoose';

export interface User {
  _id: Types.ObjectId;
  email?: string;
  githubId?: string;
  name?: string;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<User>(
  {
    email: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true
    },
    githubId: {
      type: String,
      unique: true,
      sparse: true
    },
    name: {
      type: String,
      trim: true
    },
    avatarUrl: String
  },
  {
    timestamps: true
  }
);

const UserModel: Model<User> = models.User ?? model<User>('User', userSchema);

export default UserModel;
