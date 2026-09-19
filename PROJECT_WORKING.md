# Digify Attendance and Employee Management Project

## Project Purpose

Ye project Digify IT Solution ka employee management, attendance, salary, leave, finance, company accounts, aur permissions system hai. Iska central attendance workflow ZKTeco K60 biometric device se start hota hai. Employees fingerprint ya device punch ke zariye attendance mark karte hain, office network par chalne wala connector device se records read karta hai, aur Next.js backend un records ko Supabase database mein save karke admin aur employee dashboards par display karta hai.

Project ka important design principle ye hai ke ZKTeco device office ke private network par rehta hai. Cloud-hosted Next.js application directly private biometric device ke IP address se connect nahi karti. Office PC par chalne wala attendance worker device se local TCP connection banata hai aur authenticated HTTPS request ke zariye attendance records application ke ingest endpoint ko bhejta hai.

## Technology Stack

Frontend aur backend dono Next.js App Router project ke andar hain. React client components dashboard interactions, modals, filters, attendance tables, employee portal, aur forms handle karte hain. Tailwind CSS project ki visual styling ke liye use hoti hai, jabke reusable UI components buttons, cards, fields, badges, modals, month pickers, employee pickers, empty states, aur page headers provide karte hain. TypeScript application code ke types aur build-time validation ke liye use hoti hai.

Primary database Supabase hai, jo PostgreSQL par based hai. Authentication Supabase Auth se hoti hai. Browser-side authenticated requests Supabase SSR/session helpers ke zariye protected hoti hain, aur server-side connector ingestion ke liye server-only Supabase key use hoti hai. ZKTeco communication ke liye `zkteco-js` package use hota hai. Salary receipts PDF ke liye PDF libraries available hain, aur attendance notifications ke liye Supabase Realtime integration aur browser notifier components use hote hain.

## Main Application Areas

Superadmin dashboard overview, devices, employees, attendance, leave, holidays, salary, payment tracking, company accounts, notes and reminders, lookup lists, permissions, aur settings manage kar sakta hai. Employee dashboard employee ko apni current attendance, attendance history, salary history, leave application, holidays, settings, aur relevant notifications dikhata hai. Middleware role aur module permissions ke basis par admin aur employee routes ko control karta hai.

Employee management mein employee profile, employee ID, name, email, phone, salary, department, position, joining date, status, physical address, CNIC, assigned device, device UID, aur enrollment status maintain hota hai. Admin employee account create karke usay Supabase Auth user aur internal `profiles` record se link kar sakta hai. Employee ko activate, deactivate, edit, delete, enroll, ya re-enroll kiya ja sakta hai.

Lookup management mein shifts, departments, aur positions maintain hote hain. Shift ke andar name, start time, end time, aur grace minutes save hote hain. Attendance engine shift start aur grace minutes ko use karke arrival ko on-time ya late calculate karta hai. Shift end ke around overnight sessions ko bhi support kiya gaya hai, isliye raat ke baad aane wala checkout previous working day ke session ka part ban sakta hai.

Leave management mein employee leave request submit karta hai aur admin usay approve ya decline karta hai. Approved leave attendance status par effect daal sakti hai. Holidays table ke zariye custom holidays maintain hote hain, aur Sundays generated monthly working-day rows se exclude kiye jaate hain.

Salary module monthly salary records, late/absent/half-day deductions, custom deduction amount, adjustment note, paid status, paid time, salary receipt, aur salary-linked expense ko handle karta hai. Payment tracking module manual revenue aur expense transactions ke saath salary expenses ko combine karke total revenue, expenses, aur net profit/loss show karta hai. Salary-linked expenses idempotent hote hain, isliye same salary payout retry hone par duplicate expense create nahi hota.

Company accounts module companies aur unke platform login accounts store karta hai. Account passwords normal list response mein plain text mein return nahi hote; server-side AES-256-GCM encryption ke zariye encrypted form mein store hote hain. Password reveal ya copy karne se pehle admin re-authentication required hoti hai.

Notes and reminders module personal notes aur reminders provide karta hai. Permissions module admin ko employees ke liye module-level read, add, edit, aur delete access configure karne deta hai. Profiles, notifications, aur Supabase Row Level Security policies user roles aur data access boundaries ko support karte hain.

## Supabase Database

Database Supabase PostgreSQL hai. Base tables mein `devices`, `employees`, `attendance`, aur `zkteco_sync_logs` shamil hain. `devices` table biometric devices ka name, IP address, port, device type, status, last-seen time, aur timestamps store karti hai. `employees` table employee identity, profile data, device UID, assigned device, shift, organization fields, account link, status, aur enrollment state store karti hai.

`attendance` table har biometric ya manual punch ko separate database row ke taur par store karti hai. Is table mein employee ID, device ID, ZKTeco user ID, `check_in` timestamp, status, device log identity, arrival status, day status, hours worked, exact worked minutes, session start, session end, aur manual override flag ho sakte hain. Database mein check-in aur checkout alag columns nahi hain; dono separate punch rows hain. Pehla chronological punch check-in maana jata hai aur doosra chronological punch checkout maana jata hai. `check_in` column ka naam legacy behavior ki wajah se hai, lekin checkout punch bhi isi column mein apna actual timestamp store karta hai.

Attendance duplicate protection ke liye `zk_user_id` aur timestamp ka unique conflict rule use hota hai. `device_log_id` derived device punch identity ke liye use hota hai aur ab isay globally unique device serial samajhna nahi chahiye. Manual correction ke liye `manual_override` flag available hai. Jab admin existing punch edit karta hai ya missing punch manually add karta hai, record manual override ke taur par mark hota hai taa-ke future biometric sync purana device timestamp dobara create na kare.

CRM foundation migration ke baad database mein `profiles`, `shift_timings`, `departments`, `positions`, `leaves`, `salaries`, `salary_deduction_rules`, `companies`, `company_accounts`, `expenses`, `revenues`, `permissions`, aur `notifications` tables available hain. Enrollment queue ke liye `device_commands` table use hoti hai. Holidays ke liye `holidays` table aur personal notes/reminders ke liye `personal_notes` table use hoti hai. Database changes timestamped SQL migrations ke through maintain ki jaati hain.

Supabase Auth users ko application ke `profiles` table se link karta hai. Profile role `superadmin` ya `employee` ho sakta hai. RLS policies aur application middleware admin management routes, employee self-scoped routes, aur permission-controlled modules ko protect karte hain. Service-role key sirf server-side trusted operations ke liye honi chahiye; office connector machine par ye key nahi honi chahiye.

## ZKTeco Attendance Flow

Office PC ka attendance worker ZKTeco K60 se private LAN par TCP/IP connection banata hai. Device ka configured IP aur port environment variables se aata hai, normally ZKTeco default port `4370` hota hai. Worker `getAttendances()` ke zariye device ke attendance logs fetch karta hai, raw user ID aur record time ko authenticated request mein `/api/attendance/ingest` endpoint ko bhejta hai, response log karta hai, device disconnect karta hai, aur configured polling interval ke baad next cycle chalata hai.

Ingest endpoint connector token ko timing-safe comparison ke zariye verify karta hai. Invalid token par request reject hoti hai. Valid records normalize hote hain, timestamps configured office timezone ke hisaab se convert hote hain, ZKTeco user ID ko employee ke device UID se map kiya jata hai, aur shift-based attendance fields calculate hote hain. Records Supabase attendance table mein upsert hote hain. Worker ka retry behavior natural loop par based hai; network, device, ya API failure log hoti hai aur next cycle mein retry hota hai.

Employee enrollment ka flow separate command queue use karta hai. Admin enrollment request submit karta hai, application `device_commands` mein pending command create karti hai, worker command poll karke claim karta hai, local K60 connection par user create karta hai, aur command ko succeeded ya failed status ke saath update karta hai. Is architecture mein Vercel ya cloud server private K60 IP se directly connect nahi karta.

Worker ko standalone executable ke taur par package kiya ja sakta hai. Build ke baad `dist` folder mein worker executable, environment file, logs, aur scheduled-task scripts rehte hain. Windows Scheduled Task worker ko background mein startup par run karta hai aur visible command window ki zaroorat nahi hoti. Worker logs `dist/logs/attendance-worker.log` mein likhe jaate hain aur log size limit cross hone par rotate hote hain.

## Attendance Calculation Rules

Attendance engine raw punches ko employee aur session date ke hisaab se group karta hai. Shift assigned ho to session window shift start se pehle lead time aur shift end ke baad tail time include karti hai. Overnight checkout, jaise ek din 4:00 PM check-in aur agle calendar din 12:12 AM checkout, originating attendance day ke session mein pair hota hai. Shift missing ho tab bhi session matching overnight window ke through hoti hai, taa-ke admin aur employee views same result show karein.

Session ke andar punches chronological order mein sort hote hain. Pehla punch `session_start` aur check-in hota hai. Doosra punch `session_end` aur checkout hota hai. Dono punches ke beech ka difference `worked_minutes` aur `hours_worked` mein calculate hota hai. Completed session ke total hours ke basis par day status present ya half day ban sakta hai. Shift start aur grace minutes ke comparison se arrival status on-time ya late calculate hota hai. Punch ke baghair past working day absent, approved leave leave, holiday holiday, aur future date upcoming status show kar sakti hai.

Admin attendance detail page selected employee ke monthly daily sessions show karti hai. Admin check-in ya checkout time edit kar sakta hai. Agar existing check-in ho to PATCH update hota hai; agar dono punches missing hon to pehle check-in POST create hota hai aur uske baad checkout POST create hota hai. Is order ki wajah se checkout accidental first punch nahi banta. Existing checkout ho to usay PATCH kiya jata hai. Manual editor typed time, AM/PM time, aur overnight next-day checkout ko support karta hai.

Manual edits ke baad source application edited record ko manual override mark karti hai. Agar device ne original raw punch bheja tha, ingest endpoint us original derived identity ko recognize karke duplicate old timestamp recreate nahi karta. Is protection ka purpose admin ke corrected check-in/checkout ko next worker sync se undo hone se bachana hai.

## Employee Attendance Experience

Employee dashboard ka `Today's punch` card sirf current office date ke canonical session ko use karta hai. Purani history mein koi open ya stale punch ho to us se current live timer nahi banta. Aaj check-in nahi hua ho to card employee ko check-in state nahi dikhata. Aaj check-in hua ho aur checkout nahi hua ho to live elapsed duration aur next punch close-session message show hota hai. Aaj ka session close ho chuka ho to usay historical completed state ke taur par treat kiya jata hai.

Agar kisi attendance day par sirf check-in punch ho aur us check-in ko 13 hours ya zyada guzar chuke hon, employee dashboard red `Checkout missing` warning show karta hai. Warning mein attendance date, check-in time, aur English message hota hai ke checkout missing hai aur employee administrator se checkout add karwaye. Agar multiple purane days ke checkouts missing hon to sab days warning list mein separately show hote hain.

Employee My Attendance page monthly journal ke andar har relevant day ka check-in aur checkout show karti hai. Jis row mein check-in available ho lekin checkout missing ho, usi row ke checkout column mein red dot ke saath `Checkout missing` show hota hai. Employee journal aur admin attendance detail dono same central attendance grouping engine use karte hain, isliye overnight sessions aur manual corrections dono views mein consistent hone chahiye.

## Main API Areas

Attendance APIs `/api/attendance`, `/api/attendance/ingest`, `/api/attendance/sync`, `/api/attendance/commands`, aur command-specific routes provide karti hain. `/api/attendance` admin history load, attendance patch, manual punch creation, aur attendance clearing handle karta hai. `/api/attendance/ingest` office worker ke authenticated raw records receive karta hai. `/api/attendance/commands` enrollment queue ke liye hai.

Employee self-service APIs `/api/me`, `/api/me/attendance`, `/api/me/salaries`, `/api/me/leaves`, `/api/me/holidays`, aur `/api/me/permissions` provide karti hain. Ye routes authenticated employee ke profile ID ke basis par data scope karti hain, isliye employee normally kisi doosre employee ka data read nahi karta. Admin APIs employees, devices, companies, company accounts, lookups, leaves, holidays, salaries, payments, notes, aur permissions ke CRUD workflows provide karti hain.

## Environment and Operations

Application development ke liye `npm run dev`, production build ke liye `npm run build`, aur production server ke liye `npm run start` use hota hai. Attendance worker source se build karne ke liye `npm run attendance:build` use hota hai. Windows scheduled task install, uninstall, aur office autostart ke liye package scripts available hain. Worker polling interval, office timezone offset, K60 IP/port, connector API URLs, aur connector token environment variables se configure hote hain.

Office PC par worker ko K60 tak local network access chahiye. Cloud application par `SUPABASE_SERVICE_ROLE_KEY` aur `CONNECTOR_TOKEN` server environment mein configured hone chahiye. Office worker ko matching connector token chahiye lekin Supabase service-role key nahi chahiye. Secrets ko source control mein commit nahi karna chahiye.

Operational debugging ke liye pehle scheduled task status, worker log tail, device TCP connectivity, connector token, ingest API response, aur Supabase attendance records check kiye jaate hain. Attendance mismatch mein raw database punch rows, employee shift assignment, office timezone offset, session window, manual override state, aur current API grouping ko compare karna zaroori hota hai. Admin aur employee screens ko manually different grouping logic nahi use karna chahiye; central `lib/attendance.ts` calculation engine source of truth hai.

## Important Source Locations

Main dashboard routes `app/dashboard` ke andar hain. Admin attendance pages `app/dashboard/attendance` mein, employee attendance pages `app/dashboard/employee/attendance` aur legacy self route `app/dashboard/my-attendance` mein hain. Employee dashboard UI `components/dashboard/employee-home.tsx` mein hai. Attendance calculation engine `lib/attendance.ts` mein hai, Supabase data helpers `lib/supabase.ts` mein hain, browser/server Supabase clients `lib/supabase-browser.ts` aur `lib/supabase-server.ts` mein hain, aur ZKTeco normalization `lib/zkteco.ts` mein hai.

Office worker source `scripts/attendance-worker.cjs` mein hai. Worker ka packaged deployment `dist` folder mein hota hai. Source application changes ko validate karne ke liye production build run karna chahiye, jabke office worker deployment changes ke liye separate attendance executable build aur scheduled task process follow karna hota hai.

## Current Validation Status

Current source project ka Next.js production build TypeScript compilation, route generation, aur static page generation ke saath pass ho chuka hai. Attendance session tests assigned-shift aur no-shift overnight cases ke liye verify kiye gaye hain. Recent attendance fixes ka focus manual check-in creation, manual checkout creation, overnight session grouping, employee/admin consistency, stale live timers, manual override protection, aur missing-checkout warnings par hai.
