import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A saved, replayable sequence of BOM Wizard transformations.
 *
 * Deliberately separate from `bom_import_mappings`. That table is a declarative
 * parse config — which column is which, how many rows to skip — consumed in one
 * shot. A recipe is an ordered imperative program: promote this row to headers,
 * fill these columns down, merge these references. Overloading one table would
 * mean a jsonb union and a null guard on every column, and would disturb the
 * old import path while it is still live.
 *
 * `actions` is stored opaquely. The client owns the action schema, and
 * `schema_version` is what lets it migrate an old recipe forward rather than
 * requiring a database change every time an action gains a parameter.
 */
@Entity('bom_wizard_recipes')
export class BomWizardRecipe {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'integer', default: 1 })
  schema_version: number;

  /** Ordered `RecordedAction[]`, as written by the wizard's Export. */
  @Column({ type: 'jsonb' })
  actions: unknown[];

  @Column({ type: 'varchar', nullable: true })
  created_by: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
