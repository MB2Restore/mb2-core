import React, { useState } from 'react';
import './IntakeForm.css';

function IntakeForm({ onJobCreated, apiUrl, currentUser }) {
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_phone: '',
    address1: '',
    address2: '',
    city_state: '',
    zip_code: '',
    type: 'Water Mitigation',
    emergency: false,
    lead_source: '',
    notes: ''
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const jobTypes = [
    'Water Mitigation',
    'Mold Remediation',
    'Fire Mitigation',
    'Repair',
    'Biohazard Cleanup',
    'Cleanup'
  ];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Validate required fields
      if (!formData.customer_name || !formData.address1 || !formData.city_state) {
        throw new Error('Please fill in all required fields');
      }

      // Build full address
      const fullAddress = `${formData.address1}${formData.address2 ? ' ' + formData.address2 : ''}, ${formData.city_state}${formData.zip_code ? ' ' + formData.zip_code : ''}`;

      // Create or get customer
      const customerRes = await fetch(`${apiUrl}/api/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.customer_name,
          phone: formData.customer_phone,
          address: fullAddress
        })
      });

      if (!customerRes.ok) throw new Error('Failed to create customer');
      const customer = await customerRes.json();

      // Status is derived by the backend from the emergency flag:
      // emergency -> "In Process", otherwise -> "Lead".

      // Create job
      const jobRes = await fetch(`${apiUrl}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customer.id,
          nickname: formData.address1,
          address: fullAddress,
          type: formData.type,
          emergency: formData.emergency,
          lead_source: formData.lead_source,
          phone: formData.customer_phone,
          notes: formData.notes
        })
      });

      if (!jobRes.ok) throw new Error('Failed to create job');
      const newJob = await jobRes.json();

      // If initial notes were entered, save them as the job's first Project Note
      // (this is what populates the "Latest Note" shown on the Jobs list).
      if (formData.notes && formData.notes.trim()) {
        try {
          await fetch(`${apiUrl}/api/jobs/${newJob.id}/notes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              note_text: formData.notes.trim(),
              created_by: currentUser?.name || 'Intake'
            })
          });
        } catch (e) { /* non-blocking: job is already created */ }
      }

      // Reset form
      setFormData({
        customer_name: '',
        customer_phone: '',
        address1: '',
        address2: '',
        city_state: '',
        zip_code: '',
        type: 'Water Mitigation',
        emergency: false,
        lead_source: '',
        notes: ''
      });

      onJobCreated(newJob);
    } catch (err) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="intake-form-container">
      <div className="intake-form-card">
        <h2>Quick Job Intake Form</h2>
        <p className="form-subtitle">Complete in under 2 minutes • Perfect for after-hours calls</p>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="form">
          {/* Customer Name */}
          <div className="form-group">
            <label htmlFor="customer_name">
              Customer Name *
            </label>
            <input
              type="text"
              id="customer_name"
              name="customer_name"
              value={formData.customer_name}
              onChange={handleChange}
              placeholder="e.g., John Smith"
              required
            />
          </div>

          {/* Phone */}
          <div className="form-group">
            <label htmlFor="customer_phone">
              Contact Phone (Optional)
            </label>
            <input
              type="tel"
              id="customer_phone"
              name="customer_phone"
              value={formData.customer_phone}
              onChange={handleChange}
              placeholder="e.g., (555) 123-4567"
            />
          </div>

          {/* Address 1 */}
          <div className="form-group">
            <label htmlFor="address1">
              Street Address *
            </label>
            <input
              type="text"
              id="address1"
              name="address1"
              value={formData.address1}
              onChange={handleChange}
              placeholder="e.g., 123 Main St"
              required
            />
          </div>

          {/* Address 2 (Optional) */}
          <div className="form-group">
            <label htmlFor="address2">
              Apt/Suite (Optional)
            </label>
            <input
              type="text"
              id="address2"
              name="address2"
              value={formData.address2}
              onChange={handleChange}
              placeholder="e.g., Suite 200 or Apt 3B"
            />
          </div>

          {/* City and State */}
          <div className="form-group">
            <label htmlFor="city_state">
              City, State *
            </label>
            <input
              type="text"
              id="city_state"
              name="city_state"
              value={formData.city_state}
              onChange={handleChange}
              placeholder="e.g., Springfield, IL"
              required
            />
          </div>

          {/* Zip Code (Optional) */}
          <div className="form-group">
            <label htmlFor="zip_code">
              Zip Code (Optional)
            </label>
            <input
              type="text"
              id="zip_code"
              name="zip_code"
              value={formData.zip_code}
              onChange={handleChange}
              placeholder="e.g., 62701"
            />
          </div>

          {/* Work Type */}
          <div className="form-group">
            <label htmlFor="type">Work Type *</label>
            <select
              id="type"
              name="type"
              value={formData.type}
              onChange={handleChange}
              required
            >
              {jobTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          {/* Emergency Toggle */}
          <div className="form-group checkbox-group">
            <label htmlFor="emergency">
              <input
                type="checkbox"
                id="emergency"
                name="emergency"
                checked={formData.emergency}
                onChange={(e) => {
                  setFormData(prev => ({
                    ...prev,
                    emergency: e.target.checked
                  }));
                  setError('');
                }}
              />
              Emergency Job? ⚠️
            </label>
            <small>{formData.emergency ? 'Status: In Process' : 'Status: Lead'}</small>
          </div>

          {/* Lead Source (Text Input) */}
          <div className="form-group">
            <label htmlFor="lead_source">
              Lead Source (How did they find us?)
            </label>
            <input
              type="text"
              id="lead_source"
              name="lead_source"
              value={formData.lead_source}
              onChange={handleChange}
              placeholder="e.g., Google, Referral from John, Facebook, Phone Directory, etc."
            />
          </div>

          {/* Notes (Optional) */}
          <div className="form-group">
            <label htmlFor="notes">
              Initial Notes (Optional)
            </label>
            <textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              placeholder="Any additional details from the call..."
              rows="3"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="submit-btn"
          >
            {loading ? 'Creating Job...' : '✓ Create Job & Notify Team'}
          </button>
        </form>

        <div className="form-info">
          <p>💡 <strong>What happens next:</strong></p>
          <ul>
            <li>Job is created and assigned a unique ID</li>
            <li>Customer record is automatically created</li>
            <li>Ready for field staff to clock in</li>
            <li>Team gets notified via Slack/Email</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default IntakeForm;
