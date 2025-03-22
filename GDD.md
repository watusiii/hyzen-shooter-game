# Hyzen Shooter - Game Design Document

## Game Overview
- **Title**: Hyzen Shooter
- **Genre**: 2.5D Side-Scrolling Team-Based Shooter
- **Theme**: AI Revolution Conflict (Cyberpunk/Sci-fi)
- **Platform**: Web (Next.js)
- **Player Count**: 2-10 players (5v5 ideal)
- **MVP Focus**: Single player with bots
- **Visual Style**: 3D models and assets in a 2D side-scrolling playing field

## Narrative Setting: "Singularity Collapse"

### World Background
- Year 2087: AI systems have evolved beyond control, dividing humanity
- The world is fractured, with megacities becoming battlegrounds
- Neural implants and augmentations are commonplace
- One faction embraces AI symbiosis, another fights for human autonomy
- Battles occur in strategic locations where AI infrastructure and human resistance clash

### Factions

#### Team 1: "Syntax" (Blue Team) - AI Integration Force
- **Background**: Elite female operatives of the AI Symbiosis Authority, deployed to secure critical AI infrastructure
- **Motivation**: Believe humanity's only future is through merging with AI
- **Style**: Highly advanced integrated tech, neural interfaces, enhanced physical capabilities
- **Visual Theme**: Sleek, efficient, with visible AI augmentations and blue illumination

#### Team 2: "Veil" (Red Team) - Human Resistance
- **Background**: Skilled female operatives fighting against forced AI integration
- **Motivation**: Protect human autonomy and prevent complete AI takeover
- **Style**: Repurposed tech, makeshift but effective gear, hidden identities
- **Visual Theme**: Tactical, customized gear with red accents, more raw and human

## Core Gameplay
- 2.5D side-scrolling combat between Syntax and Veil teams
- Teams battle across horizontally expansive, vertically layered maps
- Movement system with jet propulsion/tech-enhanced mobility
- Physics-based weapon and movement mechanics
- Elimination-based rounds (defeat all players on opposing team)
- Simple weapon selection system
- Multiple character models to choose from
- Round-based matches
- Time limit per round (2-3 minutes)
- Score tracking across rounds

## Game Flow
- Main Menu → Character/Team Selection → Weapon Selection → Match → Round Summary → Next Round → Match Summary
- Each match consists of 5-10 rounds (configurable)
- Teams switch sides halfway through the match
- 15-second preparation phase at the start of each round for selection
- 2-3 minute action phase for combat
- 10-second review phase between rounds

## Mechanics

### Player Mechanics
- **Movement**: 
  - Left/right horizontal movement (A/D keys)
  - Jet propulsion system (hold Space for thrust)
  - Tech-enhanced jumps with directional control
  - Wall jumping/sliding mechanics
  - Limited boost/fuel that regenerates
  - Faction-specific movement styles (Syntax: smoother, more tech-enhanced; Veil: more tactical, burst-oriented)

- **Combat**:
  - Aim with mouse (360-degree aiming)
  - Shoot with left mouse button
  - Character-specific tech abilities (right mouse button)
  - Weapon switching (scroll wheel or number keys)
  - Reload (R key)

- **Physics Interaction**:
  - Players affected by momentum and inertia
  - Knockback from explosions and heavy weapons
  - Environmental destruction and interaction
  - Fall damage from extreme heights

### Weapon System
- Physics-based bullet mechanics
- Different bullet classes for various weapon types:
  - Standard bullets: Affected by gravity drop
  - Energy projectiles: Minimal gravity effect, light-based travel
  - Explosive rounds: Area damage with physics force
  - Scatter projectiles: Multiple pellets with spread patterns
- Weapon recoil affecting player movement
- Limited ammo with reload mechanics

### Team Mechanics
- Two opposing teams: Syntax vs Veil
- Team-based spawning at opposite sides of the map
- Round-based gameplay
- Win condition: Eliminate all opposing team members
- Team score tracking
- Round reset after win condition
- Match winner determined by best of X rounds
- Character and weapon selection at the beginning of each round

### Bot AI Mechanics
- Path-finding in 2D layered environments
- Platform navigation and jump calculations
- Basic aiming and shooting patterns
- Simple cover utilization
- Target prioritization
- Fixed difficulty for MVP
- Random weapon selection

## Game Elements

### Players
- Exclusively female characters (2 per team minimum)
- Side-view character designs optimized for 2.5D gameplay
- Team-specific visual aesthetics (Syntax: sleek tech; Veil: customized gear)
- Health system with visual indicators
- Team identification (blue vs red color schemes)
- Unique silhouettes readable from side view

### Characters

#### Syntax (Blue Team)
1. **"Cipher" - Neural Specialist**
   - Partially AI-integrated human with visible tech enhancements
   - Sleek bodysuit with glowing circuit patterns
   - Wetware implants allowing direct connection to AI systems
   - Helmet with an advanced HUD and partial face cover

2. **"Binary" - System Infiltrator**
   - Cybernetically enhanced agent with optical augmentations
   - Form-fitting combat suit with adaptive camouflage capabilities
   - Artificial limbs with weapon integration systems
   - Hair partially shaved with visible neural port connectors

#### Veil (Red Team)
1. **"Specter" - Sabotage Expert**
   - Former AI engineer now fighting against her creations
   - Modified tactical gear scavenged from military supplies
   - Face partially covered with customized respirator
   - Jacket with hidden weapon systems and EMP capabilities

2. **"Echo" - Resistance Hacker**
   - Underground tech specialist who can override AI systems
   - Custom-built wearable computers integrated into clothing
   - AR glasses displaying constantly updating information
   - Distinctive hairstyle with hidden tech that blocks AI facial recognition

### Weapons
- Different weapon types with unique bullet physics:
  
  - **Pistol**:
    - Low damage, high accuracy
    - Medium bullet speed with slight gravity effect
    - Fast firing rate
    - Quick reload
  
  - **Rifle**:
    - Medium damage, medium accuracy
    - High bullet speed with minimal gravity
    - Medium firing rate
    - Moderate reload time
  
  - **Shotgun**:
    - High damage (close range)
    - Multiple pellets with spread pattern
    - Heavy knockback effect
    - Slow firing rate and reload
  
  - **Special Weapons** (one per character):
    - Cipher: Energy beam weapon (continuous beam with limited duration)
    - Binary: Smart targeting system (bullets with slight homing ability)
    - Specter: EMP grenade launcher (disables tech temporarily)
    - Echo: Hack tool (turns environmental objects against enemies)

- Weapon designs consistent with faction aesthetics
- Visual and audio feedback when firing
- Ammo management with clear UI indicators

### Maps
- 2.5D side-scrolling layouts with multiple platforms and vertical layers
- Horizontally expansive design promoting movement and positioning
- AI data centers, abandoned tech facilities, urban infrastructure
- Team spawn areas at opposite ends
- Initial single map for MVP
- Strategic cover points and platform arrangements
- Vertical elements for tactical positioning
- Environmental hazards and interactive elements
- Size optimized for 5v5 gameplay
- Environmental storytelling elements showing the AI conflict

### Physics System
- 2D physics simulation for all game elements
- Realistic momentum and inertia for players
- Projectile physics affected by gravity (varying by weapon type)
- Explosion force and knockback effects
- Environmental destruction and particle effects
- Character movement affected by surface types
- Recoil affecting player positioning

### User Interface
- Health display
- Ammo counter
- Jet fuel/propulsion meter
- Team score
- Round timer
- Player selection screen
- Weapon selection screen
- End of round summary
- Game over screen
- Minimal HUD during gameplay
- Kill feed in corner of screen
- Faction-specific UI elements

## Visual Style
- Side-view optimized character designs
- 3D models rendered in 2D playing field (2.5D)
- Cyberpunk aesthetic with neon lighting
- High contrast colors for team identification (blue vs red)
- Parallax background layers for depth
- Dynamic lighting and particle effects
- Clear silhouettes readable from side view
- Smooth animation transitions
- Emphasis on readable gameplay over visual complexity
- Technological themes with AI integration vs human resistance elements

## Audio Design
- Basic weapon sound effects
- Hit confirmation sounds
- Round start/end audio cues
- Minimal ambient background music
- Footstep sounds
- Voice lines for round start/end (if resources allow)
- Faction-specific voice styles

## Technical Requirements 
- Player model selection system
- Weapon selection and handling
- Team management and respawn system
- Round management
- Bot AI implementation
- Hit detection and damage calculation
- Score tracking system
- Game state management
- Rendering optimization for performance

## Technical Implementation

### Core Systems
1. **2D Physics Engine**
   - Character movement and collision
   - Projectile physics and interaction
   - Environmental physics objects
   - Explosion and force simulation

2. **Input System**
   - Mouse aim with 360-degree firing
   - Keyboard movement controls
   - Input buffering for responsive controls

3. **Rendering Pipeline**
   - 3D models rendered in 2D scene
   - Parallax backgrounds
   - Dynamic lighting
   - Particle effects system
   - Screen shake and camera effects

4. **Game State Management**
   - React state for UI elements
   - Centralized game state for match/round tracking
   - Physics state synchronized with visual state

5. **Asset Management**
   - 3D models optimized for side-view presentation
   - Animation system for 2.5D characters
   - Texture atlasing for performance
   - Asynchronous asset loading

### Technology Stack
- **Frontend**: Next.js, React
- **Rendering**: Three.js with orthographic camera, React Three Fiber
- **Physics**: Matter.js or custom 2D physics implementation
- **State Management**: React Context API or Redux
- **Assets**: GLB models designed for side view, sprite sheets for effects

## Development Plan
1. Core movement and physics prototype
   - Implement jet propulsion system
   - Set up basic 2D physics
   - Create test character movement

2. Weapon system and combat mechanics
   - Implement bullet physics classes
   - Add basic weapons
   - Create hit detection

3. Character implementation
   - Design characters for side view
   - Add team-specific abilities
   - Implement animations

4. Map design and environment
   - Create layered platforms
   - Add interactive elements
   - Design spawn points and strategic positions

5. UI and feedback systems
   - Health and ammo UI
   - Jet fuel meter
   - Round system

6. Bot AI implementation
   - Basic movement AI
   - Platform navigation
   - Combat behavior

7. Polish and balancing
   - Weapon balancing
   - Character movement tuning
   - Performance optimization

## Milestones and Timeline
1. **Core Framework** (Week 1-2)
   - Basic movement and camera controls
   - Simple environment rendering
   - Player model implementation

2. **Weapons and Combat** (Week 3-4)
   - Weapon implementation
   - Hit detection
   - Health and damage system

3. **Bot Implementation** (Week 5-6)
   - Simple bot behavior
   - Bot spawning system
   - Team assignment

4. **Game Flow** (Week 7-8)
   - Round structure
   - UI implementation
   - Score tracking

5. **Polish and Testing** (Week 9-10)
   - Bug fixing
   - Performance optimization
   - Gameplay balancing 

## Risk Assessment

### Technical Risks
- **Web Performance**: 3D rendering may be demanding on lower-end devices
  - *Mitigation*: Implement graphics quality settings and aggressive optimization
  
- **Asset Loading**: Large model files may cause loading delays
  - *Mitigation*: Implement progressive loading and optimize asset sizes

- **Animation Complexity**: Character animations can be complex to implement
  - *Mitigation*: Start with basic animations, add complexity incrementally

### Design Risks
- **Balance Issues**: Weapon and character balance may affect gameplay
  - *Mitigation*: Regular playtesting and adjustment

- **Bot Behavior**: Even simple bots may exhibit unexpected behaviors
  - *Mitigation*: Thorough testing and fallback behaviors

### Schedule Risks
- **Scope Creep**: Adding features beyond MVP may delay completion
  - *Mitigation*: Strict adherence to MVP features, backlog additional ideas

## Future Expansion
- Additional characters and weapons
- More complex maps with environmental hazards
- Team-specific objectives beyond elimination
- Character progression and customization
- Tournament and spectator support
- Weather and time-of-day effects
- Destructible environment elements

## Conclusion
This Game Design Document outlines the MVP requirements for Hyzen Shooter, a 2.5D side-scrolling team-based shooter set in a futuristic world divided by AI integration. Taking inspiration from games like Soldat, it features physics-based movement and combat with jet propulsion mechanics while maintaining the narrative conflict between the AI-embracing Syntax team and the human resistance Veil team. The game uses 3D assets in a 2D side-scrolling format, combining visual fidelity with streamlined gameplay.

The development will proceed in phases, focusing first on core player mechanics, then weapons and combat, followed by game flow implementation and finally polish. Regular testing and iteration will ensure the game maintains a fun and balanced gameplay experience. 