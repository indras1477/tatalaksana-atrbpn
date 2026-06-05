# BPMN Modeling Module

## Overview
The BPMN (Business Process Model and Notation) Modeling Module is a comprehensive business process modeling tool integrated into the E-SOP ATR BPN web application. It allows both Admin and standard User roles to create, edit, save, and export BPMN 2.0 compliant process models.

## Features

### 1. Pre-Modeling Configuration
Before entering the modeling canvas, users must complete a mandatory configuration form:
- **Process Title**: Descriptive name for the business process
- **Process Key**: Unique identifier for the process (e.g., PROSES_001)
- **Organizational Unit Ownership**: Hierarchical selection up to Level 2 (L1 → L2)
- **Description**: Optional detailed description of the process

### 2. BPMN Modeling Canvas
Interactive drag-and-drop interface with:

#### Flow Objects
- **Events**: Start, Intermediate, End
- **Activities**: User Task, Script Task, Service Task, Sub-process
- **Gateways**: Exclusive, Parallel, Inclusive

#### Connecting Objects
- Sequence Flows
- Message Flows
- Association Flows

#### Swimlanes
- Pools
- Lanes

### 3. Data Persistence & Portability
- **Save Functionality**: Save draft processes with metadata and BPMN XML to database
- **Load Functionality**: Load previously saved models for editing
- **Export Capability**: Export to PDF with professional formatting
- **Version Control**: Track model versions

### 4. Technical Implementation
- Built on existing BPMN server architecture from `/bpmn-server-master`
- PostgreSQL database with dedicated tables for BPMN models
- RESTful API endpoints for CRUD operations
- Client-side PDF generation using jsPDF
- Full authentication and authorization support

## Database Schema

### Tables

#### `bpmn_models`
```sql
CREATE TABLE bpmn_models (
  id SERIAL PRIMARY KEY,
  process_title VARCHAR(255) NOT NULL,
  process_key VARCHAR(255) UNIQUE NOT NULL,
  l1_id INTEGER REFERENCES unit_kerja_l1(id),
  l2_id INTEGER REFERENCES unit_kerja_l2(id),
  description TEXT,
  bpmn_xml TEXT,
  svg_xml TEXT,
  status VARCHAR(20) DEFAULT 'draft',
  version INTEGER DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### `bpmn_model_config`
```sql
CREATE TABLE bpmn_model_config (
  id SERIAL PRIMARY KEY,
  model_id INTEGER REFERENCES bpmn_models(id) ON DELETE CASCADE,
  config_key VARCHAR(100) NOT NULL,
  config_value TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## API Endpoints

### GET /api/bpmn/models
Retrieve all BPMN models
- **Auth**: Required
- **Response**: Array of model objects

### GET /api/bpmn/models/:id
Retrieve specific BPMN model by ID
- **Auth**: Required
- **Response**: Model object with unit details

### GET /api/bpmn/models/:id/config
Retrieve model configuration
- **Auth**: Required
- **Response**: Configuration key-value pairs

### POST /api/bpmn/models
Create new BPMN model with configuration
- **Auth**: Required
- **Body**: 
  ```json
  {
    "process_title": "string",
    "process_key": "string",
    "l1_id": "number",
    "l2_id": "number",
    "description": "string",
    "config": {
      "processTitle": "string",
      "processKey": "string",
      "orgUnitL1": "string",
      "orgUnitL2": "string",
      "description": "string"
    }
  }
  ```

### PUT /api/bpmn/models/:id
Update BPMN model
- **Auth**: Required
- **Body**: Complete model data

### PUT /api/bpmn/models/:id/save
Save BPMN XML and SVG
- **Auth**: Required
- **Body**: 
  ```json
  {
    "bpmn_xml": "string",
    "svg_xml": "string",
    "status": "draft|published"
  }
  ```

### DELETE /api/bpmn/models/:id
Delete BPMN model
- **Auth**: Required

### GET /api/bpmn/models/:id/export
Export model data for PDF generation
- **Auth**: Required
- **Response**: Model data with unit details

## Frontend Components

### BPMN Modeling Page (`/bpmn`)

#### Main Features
1. **Configuration Modal**: Pre-modeling setup form
2. **Tool Palette**: Left sidebar with BPMN elements
3. **Canvas**: Interactive modeling area with zoom/pan
4. **Properties Panel**: Right sidebar for element configuration
5. **Toolbar**: Top bar with save, export, undo/redo controls

#### Interactions
- **Drag & Drop**: Add elements from palette to canvas
- **Click to Select**: Select elements for property editing
- **Drag to Move**: Reposition elements on canvas
- **Connection Mode**: Create sequence/message flows between elements
- **Zoom**: Mouse wheel or toolbar buttons
- **Pan**: Middle-click drag or toolbar button

#### Keyboard Shortcuts
- `Ctrl+Z`: Undo
- `Ctrl+Y`: Redo
- `Ctrl+Mouse Wheel`: Zoom
- `Middle Click Drag`: Pan canvas

## Usage Guide

### Creating a New Model
1. Click "BPMN Modeling" in the sidebar
2. Click "Create New BPMN Model" button
3. Fill in the configuration form:
   - Process Title (required)
   - Process Key (required, auto-uppercase)
   - Organizational Unit Level 1 (required)
   - Organizational Unit Level 2 (optional)
   - Description (optional)
4. Click "Start Modeling"

### Adding Elements
1. Select element type from left palette
2. Click on canvas to place element
3. Edit properties in right panel

### Creating Connections
1. Select connection type from palette (Sequence Flow, Message Flow, etc.)
2. Click on source element
3. Click on target element

### Saving Model
1. Click "Save" button in top toolbar
2. Fill in configuration if not already done
3. Model is saved to database with 'draft' status

### Exporting to PDF
1. Click "Export PDF" button
2. PDF will be generated and downloaded
3. Includes process title, key, org units, and diagram

### Loading Existing Model
1. Click "Load Model" button
2. Select model from list
3. Model loads with all elements and connections

## Technical Stack

### Backend
- **Framework**: Express.js
- **Database**: PostgreSQL
- **Authentication**: JWT with session management
- **BPMN Engine**: Custom BPMN server (reference: bpmn-server-master)

### Frontend
- **Framework**: Next.js 16.2.2, React 19.2.4
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **PDF Generation**: jsPDF 2.5.1
- **State Management**: React hooks (useState, useEffect, useCallback)

## Security Considerations

1. **Authentication**: All endpoints require valid JWT token
2. **Authorization**: Role-based access control (Admin/User)
3. **Input Validation**: Server-side validation for all inputs
4. **SQL Injection Prevention**: Parameterized queries
5. **XSS Prevention**: Input sanitization
6. **Session Management**: Token-based with expiration

## Performance Optimizations

1. **Canvas Rendering**: Efficient DOM updates with minimal re-renders
2. **History Management**: Limited undo/redo stack
3. **Lazy Loading**: Configuration data loaded on demand
4. **Debounced Updates**: Property changes batched

## Browser Compatibility

- Chrome/Edge: Latest 2 versions
- Firefox: Latest 2 versions
- Safari: Latest 2 versions

## Future Enhancements

1. BPMN 2.0 XML import/export
2. Process simulation and execution
3. Collaborative editing (real-time)
4. Advanced validation rules
5. Custom element libraries
6. Process analytics dashboard
7. Integration with BPMN execution engine

## Troubleshooting

### Common Issues

1. **Canvas not responding**
   - Check browser console for errors
   - Clear localStorage and reload
   - Verify authentication token

2. **Cannot save model**
   - Ensure all required fields are filled
   - Check database connection
   - Verify user permissions

3. **PDF export fails**
   - Ensure jsPDF library is loaded
   - Check browser popup blocker
   - Try smaller model size

4. **Elements not connecting**
   - Verify connection mode is active
   - Check element IDs are unique
   - Ensure elements are not overlapping

## Support

For issues or questions, contact the development team or refer to the project documentation.

## License

Proprietary - ATR BPN Internal Use Only
