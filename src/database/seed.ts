import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import dataSource from './data-source';
import { Employee, ShiftTemplate, Site, User } from './entities';
import { Role } from '../common/roles';

async function seed() {
  const ds = await dataSource.initialize();
  const users = ds.getRepository(User);
  const employees = ds.getRepository(Employee);

  const upsertUser = async (email: string, role: Role, password: string) =>
    (await users.findOne({ where: { email } })) ??
    users.save(
      users.create({
        email,
        role,
        passwordHash: await bcrypt.hash(password, 10),
      }),
    );

  await upsertUser('admin@example.com', Role.ADMIN, 'Admin123!');
  await upsertUser('lider@example.com', Role.LEADER, 'Lider123!');

  const sites = ds.getRepository(Site);
  const site =
    (await sites.findOne({ where: { name: 'Sede Principal' } })) ??
    (await sites.save(
      sites.create({ name: 'Sede Principal', address: 'Calle 1 # 2-3' }),
    ));

  const shifts = ds.getRepository(ShiftTemplate);
  if (!(await shifts.exists({ where: { name: 'Turno Mañana' } }))) {
    await shifts.save(
      shifts.create({
        name: 'Turno Mañana',
        startTime: '07:00',
        endTime: '16:00',
        lateToleranceMinutes: 5,
      }),
    );
  }

  const staff = [
    { email: 'colaborador1@example.com', name: 'Colaborador Uno', doc: '1001' },
    { email: 'colaborador2@example.com', name: 'Colaborador Dos', doc: '1002' },
  ];
  for (const s of staff) {
    const user = await upsertUser(s.email, Role.EMPLOYEE, 'Colab123!');
    if (!(await employees.exists({ where: { documentNumber: s.doc } }))) {
      await employees.save(
        employees.create({
          fullName: s.name,
          documentNumber: s.doc,
          siteId: site.id,
          userId: user.id,
        }),
      );
    }
  }
  console.log('Seed completado');
  await ds.destroy();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
