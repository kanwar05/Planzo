import { Component } from "react";
import Button from "./Button";
export default class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main className="container-shell flex min-h-screen items-center justify-center py-16"><div className="max-w-md text-center"><p className="eyebrow">Let’s get you back on track</p><h1 className="mt-4 font-editorial text-4xl">A small pause in the plans.</h1><p className="mt-5 text-sm leading-7 text-ink/65">This page couldn’t load. Refresh to try again. Your saved account details and bookings are still in your account.</p><Button className="mt-6" onClick={() => window.location.reload()}>Refresh page</Button></div></main>;
    return this.props.children;
  }
}
