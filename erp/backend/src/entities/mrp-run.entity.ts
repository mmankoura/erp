import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { MrpDemandLine } from './mrp-demand-line.entity';

export enum MrpRunStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

/**
 * A container for a set of admitted demand.
 *
 * A partial unique index guarantees at most one ACTIVE run, so every read has an
 * unambiguous default and the UI needs no run picker. DRAFT runs exist so that a
 * what-if sandbox is an ordinary run rather than a special case.
 */
@Entity('mrp_runs')
export class MrpRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({
    type: 'enum',
    enum: MrpRunStatus,
    enumName: 'mrp_run_status_enum',
    default: MrpRunStatus.DRAFT,
  })
  status: MrpRunStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  created_by: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  archived_at: Date | null;

  @OneToMany(() => MrpDemandLine, (line) => line.run)
  demand_lines: MrpDemandLine[];
}
