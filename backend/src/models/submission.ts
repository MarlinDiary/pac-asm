import { Schema, model, models, Document } from 'mongoose';
import { Architecture } from '../game/emulator/types';
import { GameValidationSummary } from '../game/game-runner';

export interface SubmissionDocument extends Document {
  userId: string;
  userName: string;
  userAvatarUrl?: string;
  levelId: string;
  architecture: Architecture;
  status?: 'Accepted' | 'Failed';
  successRate?: number;
  averageScore?: number;
  summary: GameValidationSummary;
  createdAt: Date;
  updatedAt: Date;
}

const submissionSchema = new Schema<SubmissionDocument>(
  {
    userId: {
      type: String,
      required: true,
      index: true
    },
    userName: {
      type: String,
      required: true,
    },
    userAvatarUrl: String,
    levelId: {
      type: String,
      required: true,
      index: true
    },
    architecture: {
      type: String,
      enum: ['ARM', 'MIPS_R6'],
      required: true
    },
    status: {
      type: String,
      enum: ['Accepted', 'Failed'],
      default: undefined
    },
    successRate: Number,
    averageScore: Number,
    summary: {
      type: Schema.Types.Mixed,
      required: true
    }
  },
  {
    timestamps: true
  }
);

submissionSchema.index({ userId: 1, levelId: 1, architecture: 1 });

const SubmissionModel = models.Submission ?? model<SubmissionDocument>('Submission', submissionSchema);

export default SubmissionModel;
